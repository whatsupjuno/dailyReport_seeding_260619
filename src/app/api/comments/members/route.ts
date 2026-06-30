import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { commentAccess, listMentionMembers } from "@/lib/data/comments";

const ROLE_LABEL: Record<string, string> = {
  employee: "직원",
  group_leader: "그룹장",
  admin: "관리자",
};

// @멘션 자동완성용 멤버 목록(해당 업무 댓글 열람권이 있는 활성 사용자). 로그인 필요.
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const rawTaskId = new URL(req.url).searchParams.get("taskId");
  const taskId = rawTaskId == null ? null : parseId(rawTaskId);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");

  const access = await commentAccess(taskId, user);
  if (!access) return forbidden();

  const members = await listMentionMembers(access.ctx.report_id);
  return NextResponse.json({
    ok: true,
    members: members.map((m) => ({
      id: Number(m.id),
      name: m.name,
      role: ROLE_LABEL[m.role] ?? m.role,
    })),
  });
}
