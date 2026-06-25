import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { deleteGroup, updateGroup } from "@/lib/data/admin";
import { notifyTimePolicyChanged } from "@/lib/mail/notify";

/** 그룹 정보 수정(이름·그룹장) — 관리자 전용 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const groupId = parseId(id);
  if (groupId == null) return badRequest("잘못된 그룹 ID입니다.");

  const body = (await req.json().catch(() => ({}))) as { name?: string; leaderId?: number | null; isAi?: boolean; writeStart?: string; writeEnd?: string; submitDue?: string | null; inviteAt?: string | null };
  if (!body.name?.trim()) return badRequest("그룹명을 입력해 주세요.");
  const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;
  if (body.writeStart && !HM.test(body.writeStart)) return badRequest("작성 시작 시각 형식이 올바르지 않습니다.");
  if (body.writeEnd && !HM.test(body.writeEnd)) return badRequest("작성 종료 시각 형식이 올바르지 않습니다.");
  if (body.submitDue && !HM.test(body.submitDue)) return badRequest("자동제출 시각 형식이 올바르지 않습니다.");
  if (body.inviteAt && !HM.test(body.inviteAt)) return badRequest("작성 요청 메일 시각 형식이 올바르지 않습니다.");

  try {
    const res = await updateGroup(groupId, {
      name: body.name.trim(),
      leaderId: body.leaderId ?? null,
      isAi: body.isAi,
      writeStart: body.writeStart,
      writeEnd: body.writeEnd,
      submitDue: body.submitDue,
      inviteAt: body.inviteAt,
    });
    // 시간정책이 바뀌었으면 그룹원에게 안내 메일(best-effort, 커밋 후). 응답을 막지 않음.
    if (res.policyChanged) {
      const w = res.window;
      const due = w.submitDue ? `자동제출 ${w.submitDue}` : "자동제출 없음";
      const invite = w.inviteAt ? `작성요청 ${w.inviteAt}` : "작성요청 메일 없음";
      const summary = w.isAi
        ? `AI 그룹 · 작성 ${w.writeStart}~${w.writeEnd}(익일) · ${due} · ${invite} · 매일 · 24시간 표기`
        : `작성 ${w.writeStart}~${w.writeEnd} · ${due} · ${invite} · 평일`;
      await notifyTimePolicyChanged(groupId, summary);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "DUPLICATE_NAME") return conflict("이미 사용 중인 그룹명입니다.");
    if (m === "NAME_REQUIRED") return badRequest("그룹명을 입력해 주세요.");
    if (m === "NOT_FOUND") return badRequest("그룹을 찾을 수 없습니다.");
    if (m === "LEADER_NOT_ACTIVE") return badRequest("비활성 사용자는 그룹장으로 지정할 수 없습니다.");
    throw e;
  }
}

/** 그룹 삭제 — 관리자 전용. 구성원은 소속 없음으로 전환(데이터 보존). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const groupId = parseId(id);
  if (groupId == null) return badRequest("잘못된 그룹 ID입니다.");

  try {
    await deleteGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return badRequest("그룹을 찾을 수 없습니다.");
    throw e;
  }
}
