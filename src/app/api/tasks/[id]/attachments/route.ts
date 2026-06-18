import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { addFileAttachment, addUrlAttachment } from "@/lib/data/attachments";

function mapErr(e: unknown) {
  const m = (e as Error).message;
  if (m === "FORBIDDEN") return forbidden();
  if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
  if (m === "LOCKED") return badRequest("마감/제출된 보고서에는 첨부할 수 없습니다.");
  if (m === "TOO_LARGE") return badRequest("파일이 너무 큽니다(최대 10MB).");
  if (m === "EMPTY_FILE") return badRequest("빈 파일입니다.");
  return null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");

  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const comment = (form.get("comment") as string | null)?.trim() || null;
      if (!(file instanceof File)) return badRequest("파일이 없습니다.");
      const res = await addFileAttachment(taskId, user.id, file, comment);
      return NextResponse.json({ ok: true, id: res.id, kind: "file" });
    }
    const body = (await req.json().catch(() => ({}))) as { url?: string; comment?: string };
    const url = (body.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) return badRequest("http(s) URL을 입력해 주세요.");
    const res = await addUrlAttachment(taskId, user.id, url, body.comment?.trim() || null);
    return NextResponse.json({ ok: true, id: res.id, kind: "url" });
  } catch (e) {
    const mapped = mapErr(e);
    if (mapped) return mapped;
    throw e;
  }
}
