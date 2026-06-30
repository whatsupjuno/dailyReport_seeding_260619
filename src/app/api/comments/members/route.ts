import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/api";
import { listMentionMembers } from "@/lib/data/comments";

const ROLE_LABEL: Record<string, string> = {
  employee: "직원",
  group_leader: "그룹장",
  admin: "관리자",
};

// @멘션 자동완성용 멤버 목록(실제 조직 활성 사용자). 로그인 필요.
export async function GET() {
  const user = await apiUser();
  if (!user) return unauthorized();
  const members = await listMentionMembers();
  return NextResponse.json({
    ok: true,
    members: members.map((m) => ({
      id: Number(m.id),
      name: m.name,
      role: ROLE_LABEL[m.role] ?? m.role,
    })),
  });
}
