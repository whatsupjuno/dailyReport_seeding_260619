import { requireAdmin } from "@/lib/auth/guard";
import { listGroupsWithMembers } from "@/lib/data/admin";
import { listUsers } from "@/lib/data/users";
import GroupsAdmin from "@/components/admin/GroupsAdmin";

export default async function AdminGroupsPage() {
  await requireAdmin();
  const [groups, users] = await Promise.all([listGroupsWithMembers(), listUsers()]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>그룹 및 그룹장 관리</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 16 }}>그룹을 만들고 구성원·그룹장을 지정합니다. 그룹장은 소속 구성원의 일일 보고서를 승인·반려합니다.</div>

      <GroupsAdmin
        groups={groups}
        users={users
          .filter((u) => u.active)
          .map((u) => ({ id: u.id, name: u.name, login_id: u.login_id, group_id: u.group_id, group_name: u.group_name ?? null }))}
      />
    </div>
  );
}
