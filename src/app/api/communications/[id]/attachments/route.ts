import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { addCommFileAttachment, addCommUrlAttachment } from "@/lib/data/attachments";

function mapErr(e: unknown) {
  const m = (e as Error).message;
  if (m === "FORBIDDEN") return forbidden();
  if (m === "NOT_FOUND") return badRequest("커뮤니케이션을 찾을 수 없습니다.");
  if (m === "LOCKED") return badRequest("제출된 보고서에는 첨부할 수 없습니다.");
  if (m === "TOO_LARGE") return badRequest("파일이 너무 큽니다(최대 10MB).");
  if (m === "EMPTY_FILE") return badRequest("빈 파일입니다.");
  if (m === "BAD_URL") return badRequest("http(s):// 로 시작하는 올바른 URL을 입력해 주세요.");
  return null;
}

/** 커뮤니케이션 기록에 첨부 — 파일(multipart) 또는 URL 링크(JSON) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const commId = parseId(id);
  if (commId == null) return badRequest("잘못된 커뮤니케이션 ID입니다.");

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json().catch(() => ({}))) as { url?: string; comment?: string };
      const url = (body.url ?? "").trim();
      const comment = (body.comment ?? "").trim() || null;
      if (!url) return badRequest("URL을 입력해 주세요.");
      const res = await addCommUrlAttachment(commId, user.id, url, comment);
      return NextResponse.json({ ok: true, id: res.id });
    }
    const form = await req.formData();
    const file = form.get("file");
    const comment = (form.get("comment") as string | null)?.trim() || null;
    if (!(file instanceof File)) return badRequest("파일이 없습니다.");
    const res = await addCommFileAttachment(commId, user.id, file, comment);
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const mapped = mapErr(e);
    if (mapped) return mapped;
    throw e;
  }
}
