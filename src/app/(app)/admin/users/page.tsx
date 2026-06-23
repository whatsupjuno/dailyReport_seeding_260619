import { requireAdmin } from "@/lib/auth/guard";
import { listUsers } from "@/lib/data/users";
import { listGroupOptions } from "@/lib/data/admin";
import UsersAdmin from "@/components/admin/UsersAdmin";

export default async function AdminUsersPage() {
  await requireAdmin();
  const [users, groups] = await Promise.all([listUsers(), listGroupOptions()]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>사용자 관리</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 20 }}>사용자 계정과 소속 그룹·역할을 관리합니다.</div>
      <UsersAdmin
        users={users.map((u) => ({ id: u.id, name: u.name, login_id: u.login_id, role: u.role, group_id: u.group_id, group_name: u.group_name ?? null, active: u.active, report_required: u.report_required }))}
        groups={groups}
      />
    </div>
  );
}
