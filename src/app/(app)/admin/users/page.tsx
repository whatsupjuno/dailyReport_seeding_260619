import { requireAdmin } from "@/lib/auth/guard";
import { listUsers } from "@/lib/data/users";
import { listGroupOptions } from "@/lib/data/admin";
import AddUser from "@/components/admin/AddUser";

const ROLE_LABEL: Record<string, string> = { employee: "직원", group_leader: "그룹장", admin: "관리자" };

export default async function AdminUsersPage() {
  await requireAdmin();
  const [users, groups] = await Promise.all([listUsers(), listGroupOptions()]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>사용자 관리</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 20 }}>사용자 계정과 소속 그룹·역할을 관리합니다.</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#3A4150" }}>총 <span className="tnum">{users.length}</span>명</span>
        <div style={{ flex: 1 }} />
        <AddUser groups={groups} />
      </div>

      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="admin-users-table">
          <thead>
            <tr style={{ background: "#F7F8FA" }}>
              {["이름", "아이디", "소속 그룹", "역할", "상태"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="admin-user-row">
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600 }}>{u.name}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{u.login_id}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#3A4150" }}>{u.group_name ?? "—"}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, fontWeight: 600, color: "#3A4150" }}>{ROLE_LABEL[u.role]}</td>
                <td style={{ padding: "13px 16px" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: u.active ? "#E7F6EC" : "#F1F2F4", border: `1px solid ${u.active ? "#BBE5C8" : "#D9DCE2"}`, color: u.active ? "#1F9254" : "#6B7280" }}>
                    {u.active ? "활성" : "비활성"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
