import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getCommAttachmentWithOwner, deleteCommAttachment, UPLOAD_DIR } from "@/lib/data/attachments";

/** 커뮤니케이션 첨부 다운로드 — 소유자 또는 검수권자 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const attId = parseId(id);
  if (attId == null) return badRequest("잘못된 첨부 ID입니다.");

  const a = await getCommAttachmentWithOwner(attId);
  if (!a || !a.storage_path) return badRequest("파일을 찾을 수 없습니다.");
  const isOwner = a.owner_id === user.id;
  const isReviewer =
    user.role === "admin" || (user.role === "group_leader" && a.leader_user_id === user.id);
  if (!isOwner && !isReviewer) return forbidden();

  let buf: Buffer;
  try {
    buf = await readFile(join(UPLOAD_DIR(), a.storage_path));
  } catch {
    return badRequest("파일이 존재하지 않습니다.");
  }
  const name = encodeURIComponent(a.file_name ?? "download");
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/** 커뮤니케이션 첨부 삭제 — 소유자 + 미제출 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const attId = parseId(id);
  if (attId == null) return badRequest("잘못된 첨부 ID입니다.");
  try {
    await deleteCommAttachment(attId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "FORBIDDEN") return forbidden();
    if (m === "NOT_FOUND") return badRequest("첨부를 찾을 수 없습니다.");
    if (m === "LOCKED") return conflict("제출된 보고서의 첨부는 삭제할 수 없습니다.");
    throw e;
  }
}
