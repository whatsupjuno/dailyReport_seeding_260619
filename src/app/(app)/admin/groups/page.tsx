import { requireAdmin } from "@/lib/auth/guard";
import { listGroupsWithMembers } from "@/lib/data/admin";

export default async function AdminGroupsPage() {
  await requireAdmin();
  const groups = await listGroupsWithMembers();

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>그룹 및 그룹장 관리</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 16 }}>그룹장은 소속 구성원의 일일 보고서를 승인·반려합니다.</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }} data-testid="admin-groups">
        {groups.map((g) => (
          <div key={g.id} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: 18 }} data-testid="admin-group-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{g.name}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", background: "#F1F2F4", borderRadius: 9999, padding: "3px 10px" }}>구성원 <span className="tnum">{g.members.length}</span>명</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#F3F0FE", border: "1px solid #E4DCFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9999, background: "#7C5CFC", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{(g.leader_name ?? "?").slice(0, 1)}</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{g.leader_name ?? "미지정"}</div><div style={{ fontSize: 11, color: "#8B7FC4" }}>그룹장 · 승인 권한</div></div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#9AA1AE", marginBottom: 8 }}>구성원</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {g.members.map((m) => (
                <span key={m.id} style={{ fontSize: 12, color: "#3A4150", fontWeight: 600, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 9999, padding: "3px 10px" }}>{m.name}</span>
              ))}
              {g.members.length === 0 && <span style={{ fontSize: 12, color: "#9AA1AE" }}>구성원 없음</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
