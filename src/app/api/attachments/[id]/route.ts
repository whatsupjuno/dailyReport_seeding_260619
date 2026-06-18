import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getAttachmentWithOwner, UPLOAD_DIR } from "@/lib/data/attachments";

/** 첨부 파일 다운로드 — 소유자 또는 검수권자(그룹장/관리자)만 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const attId = parseId(id);
  if (attId == null) return badRequest("잘못된 첨부 ID입니다.");

  const a = await getAttachmentWithOwner(attId);
  if (!a || a.kind !== "file" || !a.storage_path) return badRequest("파일을 찾을 수 없습니다.");

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
