import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guard";
import { parseId } from "@/lib/auth/api";
import { getUserById } from "@/lib/data/users";
import UserProfile from "@/components/admin/UserProfile";

export default async function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const uid = parseId(id); // 양의 정수만 허용(API 라우트와 동일 규칙)
  if (uid == null) notFound();
  const u = await getUserById(uid);
  if (!u) notFound();

  return (
    <UserProfile
      user={{
        id: u.id,
        name: u.name,
        login_id: u.login_id,
        email: u.email,
        role: u.role,
        group_id: u.group_id,
        group_name: u.group_name ?? null,
        active: u.active,
        report_required: u.report_required,
      }}
    />
  );
}
