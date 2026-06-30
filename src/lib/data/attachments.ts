import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join, basename } from "node:path";
import type { PoolClient } from "pg";
import { env } from "../env";
import { query, queryOne, tx } from "../db";
import { FINAL_LOCKED } from "../domain/status";

// 제출 이후 잠금은 FINAL_LOCKED(report-mutations와 단일 기준).

function isLockedReportStatus(status: string): boolean {
  return (FINAL_LOCKED as readonly string[]).includes(status);
}

export interface AttachmentRow {
  id: number;
  task_id: number;
  kind: "file" | "url";
  file_name: string | null;
  url: string | null;
  storage_path: string | null;
  comment: string | null;
}

/** task가 편집 가능한지(소유자 + 미제출 + 섹션 미잠금) 확인하고 보고서 행을 잠근다. */
async function assertEditableTask(c: PoolClient, taskId: number, userId: number) {
  // v2는 section_id=NULL이므로 LEFT JOIN(섹션 없으면 locked=false 취급).
  const row = (
    await c.query<{ user_id: number; status: string; locked: boolean | null }>(
    `SELECT r.user_id, r.status, s.locked
       FROM tasks t JOIN daily_reports r ON r.id=t.report_id
       LEFT JOIN report_sections s ON s.id=t.section_id
      WHERE t.id=$1
      FOR UPDATE OF r`,
    [taskId],
    )
  ).rows[0];
  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");
  if (isLockedReportStatus(row.status) || row.locked === true) throw new Error("LOCKED");
}

export async function addUrlAttachment(
  taskId: number,
  userId: number,
  url: string,
  comment: string | null,
): Promise<{ id: number }> {
  return tx(async (c) => {
    await assertEditableTask(c, taskId, userId);
    const r = await c.query<{ id: number }>(
      `INSERT INTO task_attachments(task_id, kind, url, comment) VALUES ($1,'url',$2,$3) RETURNING id`,
      [taskId, url, comment],
    );
    return { id: r.rows[0].id };
  });
}

export async function addFileAttachment(
  taskId: number,
  userId: number,
  file: File,
  comment: string | null,
): Promise<{ id: number }> {
  if (file.size === 0) throw new Error("EMPTY_FILE");
  if (file.size > env.maxUploadBytes) throw new Error("TOO_LARGE");

  return tx(async (c) => {
    await assertEditableTask(c, taskId, userId);
    await mkdir(env.uploadDir, { recursive: true });
    const safeExt = extname(file.name).slice(0, 12).replace(/[^.\w가-힣-]/g, "");
    const stored = `${Date.now()}_${randomBytes(8).toString("hex")}${safeExt}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(join(env.uploadDir, stored), buf);

    const r = await c.query<{ id: number }>(
      `INSERT INTO task_attachments(task_id, kind, file_name, storage_path, comment)
       VALUES ($1,'file',$2,$3,$4) RETURNING id`,
      [taskId, basename(file.name).slice(0, 200), stored, comment],
    );
    return { id: r.rows[0].id };
  });
}

/** 다운로드 인가용: 첨부 + 보고서 소유자/그룹 정보 */
export async function getAttachmentWithOwner(attId: number) {
  return queryOne<{
    id: number;
    kind: string;
    file_name: string | null;
    storage_path: string | null;
    owner_id: number;
    leader_user_id: number | null;
  }>(
    `SELECT a.id, a.kind, a.file_name, a.storage_path,
            r.user_id AS owner_id, g.leader_user_id
       FROM task_attachments a
       JOIN tasks t ON t.id=a.task_id
       JOIN daily_reports r ON r.id=t.report_id
       JOIN users u ON u.id=r.user_id
       LEFT JOIN groups g ON g.id=u.group_id
      WHERE a.id=$1`,
    [attId],
  );
}

/** 보고서의 모든 첨부 (task_id별 그룹핑용) */
export async function attachmentsByReport(reportId: number): Promise<AttachmentRow[]> {
  return query<AttachmentRow>(
    `SELECT a.id, a.task_id, a.kind, a.file_name, a.url, a.storage_path, a.comment
       FROM task_attachments a JOIN tasks t ON t.id=a.task_id
      WHERE t.report_id=$1 ORDER BY a.id`,
    [reportId],
  );
}

// ===== 커뮤니케이션 첨부(파일 전용) =====

export interface CommAttachmentRow {
  id: number;
  communication_id: number;
  file_name: string | null;
  url: string | null; // 있으면 링크 첨부, 없으면 파일 첨부
  comment: string | null;
}

/** 커뮤니케이션이 편집 가능한지(소유자 + 미제출) 확인하고 보고서 행을 잠근다. */
async function assertEditableComm(c: PoolClient, commId: number, userId: number) {
  const row = (
    await c.query<{ user_id: number; status: string }>(
    `SELECT r.user_id, r.status
       FROM communications cm JOIN daily_reports r ON r.id=cm.report_id
      WHERE cm.id=$1
      FOR UPDATE OF r`,
    [commId],
    )
  ).rows[0];
  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");
  if (isLockedReportStatus(row.status)) throw new Error("LOCKED");
}

export async function addCommFileAttachment(
  commId: number,
  userId: number,
  file: File,
  comment: string | null,
): Promise<{ id: number }> {
  if (file.size === 0) throw new Error("EMPTY_FILE");
  if (file.size > env.maxUploadBytes) throw new Error("TOO_LARGE");

  return tx(async (c) => {
    await assertEditableComm(c, commId, userId);
    await mkdir(env.uploadDir, { recursive: true });
    const safeExt = extname(file.name).slice(0, 12).replace(/[^.\w가-힣-]/g, "");
    const stored = `${Date.now()}_${randomBytes(8).toString("hex")}${safeExt}`;
    await writeFile(join(env.uploadDir, stored), Buffer.from(await file.arrayBuffer()));

    const r = await c.query<{ id: number }>(
      `INSERT INTO communication_attachments(communication_id, file_name, storage_path, comment)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [commId, basename(file.name).slice(0, 200), stored, comment],
    );
    return { id: r.rows[0].id };
  });
}

/** 커뮤니케이션 기록에 URL(링크) 첨부 */
export async function addCommUrlAttachment(
  commId: number,
  userId: number,
  url: string,
  comment: string | null,
): Promise<{ id: number }> {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) throw new Error("BAD_URL");
  if (u.length > 2000) throw new Error("BAD_URL");
  return tx(async (c) => {
    await assertEditableComm(c, commId, userId);
    const r = await c.query<{ id: number }>(
      `INSERT INTO communication_attachments(communication_id, url, comment)
       VALUES ($1,$2,$3) RETURNING id`,
      [commId, u, comment],
    );
    return { id: r.rows[0].id };
  });
}

/** 보고서의 커뮤니케이션 첨부 (communication_id별 그룹핑용) */
export async function commAttachmentsByReport(reportId: number): Promise<CommAttachmentRow[]> {
  return query<CommAttachmentRow>(
    `SELECT a.id, a.communication_id, a.file_name, a.url, a.comment
       FROM communication_attachments a JOIN communications cm ON cm.id=a.communication_id
      WHERE cm.report_id=$1 ORDER BY a.id`,
    [reportId],
  );
}

/** 커뮤니케이션 첨부 다운로드 인가용 */
export async function getCommAttachmentWithOwner(attId: number) {
  return queryOne<{
    id: number;
    file_name: string | null;
    storage_path: string | null;
    owner_id: number;
    leader_user_id: number | null;
  }>(
    `SELECT a.id, a.file_name, a.storage_path, r.user_id AS owner_id, g.leader_user_id
       FROM communication_attachments a
       JOIN communications cm ON cm.id=a.communication_id
       JOIN daily_reports r ON r.id=cm.report_id
       JOIN users u ON u.id=r.user_id
       LEFT JOIN groups g ON g.id=u.group_id
      WHERE a.id=$1`,
    [attId],
  );
}

/** 커뮤니케이션 첨부 삭제(소유자 + 미제출). 파일은 남겨두되 레코드 제거(고아 파일은 운영 정리). */
export async function deleteCommAttachment(attId: number, userId: number): Promise<void> {
  await tx(async (c) => {
    const row = (
      await c.query<{ comm_id: number; user_id: number; status: string }>(
        `SELECT a.communication_id AS comm_id, r.user_id, r.status
           FROM communication_attachments a
           JOIN communications cm ON cm.id=a.communication_id
           JOIN daily_reports r ON r.id=cm.report_id
          WHERE a.id=$1
          FOR UPDATE OF r`,
        [attId],
      )
    ).rows[0];
    if (!row) throw new Error("NOT_FOUND");
    if (row.user_id !== userId) throw new Error("FORBIDDEN");
    if (isLockedReportStatus(row.status)) throw new Error("LOCKED");
    await c.query(`DELETE FROM communication_attachments WHERE id=$1`, [attId]);
  });
}

export const UPLOAD_DIR = () => env.uploadDir;
