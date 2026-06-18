import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { extname, join, basename } from "node:path";
import { env } from "../env";
import { query, queryOne } from "../db";

const SUBMITTED = ["검수대기", "승인", "제출완료", "재제출"];

export interface AttachmentRow {
  id: number;
  task_id: number;
  kind: "file" | "url";
  file_name: string | null;
  url: string | null;
  storage_path: string | null;
  comment: string | null;
}

/** task가 편집 가능한지(소유자 + 미제출 + 섹션 미잠금) 확인 */
async function assertEditableTask(taskId: number, userId: number) {
  const row = await queryOne<{ user_id: number; status: string; locked: boolean }>(
    `SELECT r.user_id, r.status, s.locked
       FROM tasks t JOIN daily_reports r ON r.id=t.report_id
       JOIN report_sections s ON s.id=t.section_id
      WHERE t.id=$1`,
    [taskId],
  );
  if (!row) throw new Error("NOT_FOUND");
  if (row.user_id !== userId) throw new Error("FORBIDDEN");
  if (SUBMITTED.includes(row.status) || row.locked) throw new Error("LOCKED");
}

export async function addUrlAttachment(
  taskId: number,
  userId: number,
  url: string,
  comment: string | null,
): Promise<{ id: number }> {
  await assertEditableTask(taskId, userId);
  const r = await queryOne<{ id: number }>(
    `INSERT INTO task_attachments(task_id, kind, url, comment) VALUES ($1,'url',$2,$3) RETURNING id`,
    [taskId, url, comment],
  );
  return { id: r!.id };
}

export async function addFileAttachment(
  taskId: number,
  userId: number,
  file: File,
  comment: string | null,
): Promise<{ id: number }> {
  await assertEditableTask(taskId, userId);
  if (file.size === 0) throw new Error("EMPTY_FILE");
  if (file.size > env.maxUploadBytes) throw new Error("TOO_LARGE");

  await mkdir(env.uploadDir, { recursive: true });
  const safeExt = extname(file.name).slice(0, 12).replace(/[^.\w가-힣-]/g, "");
  const stored = `${Date.now()}_${randomBytes(8).toString("hex")}${safeExt}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(join(env.uploadDir, stored), buf);

  const r = await queryOne<{ id: number }>(
    `INSERT INTO task_attachments(task_id, kind, file_name, storage_path, comment)
     VALUES ($1,'file',$2,$3,$4) RETURNING id`,
    [taskId, basename(file.name).slice(0, 200), stored, comment],
  );
  return { id: r!.id };
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

export const UPLOAD_DIR = () => env.uploadDir;
