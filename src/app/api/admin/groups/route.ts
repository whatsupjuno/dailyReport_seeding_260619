import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, unauthorized } from "@/lib/auth/api";
import { createGroup } from "@/lib/data/admin";
import { parseGroupBody } from "./body";

/** 그룹 생성 — 관리자 전용 */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const parsed = parseGroupBody(await req.json().catch(() => null));
  if (!parsed.ok) return badRequest(parsed.error);
  const { body } = parsed;

  try {
    const res = await createGroup({
      name: body.name,
      leaderId: body.leaderId,
      isAi: body.isAi ?? false,
      writeStart: body.writeStart,
      writeEnd: body.writeEnd,
      submitDue: body.submitDue,
      inviteAt: body.inviteAt,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "DUPLICATE_NAME") return conflict("이미 사용 중인 그룹명입니다.");
    if (m === "NAME_REQUIRED") return badRequest("그룹명을 입력해 주세요.");
    if (m === "LEADER_NOT_ACTIVE") return badRequest("비활성 사용자는 그룹장으로 지정할 수 없습니다.");
    if (m === "LEADER_NOT_ASSIGNABLE") return badRequest("그룹장은 관리자 또는 그룹장 역할 사용자만 지정할 수 있습니다.");
    throw e;
  }
}
