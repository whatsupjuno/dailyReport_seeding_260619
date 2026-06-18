import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listMyReports, listScopeReports, type MgrRow } from "@/lib/data/list";
import { statusMeta } from "@/lib/domain/status";
import { todayKstISO, shortDate, weekday } from "@/lib/date";

function timeOf(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

function Bar({ done, total }: { done: number; total: number }) {
  if (total === 0) return <span style={{ color: "#CBD0D9" }}>—</span>;
  const pct = Math.round((done / total) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 54, height: 6, background: "#EFF1F5", borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#1F9254" }} />
      </div>
      <span style={{ fontSize: 12, color: "#3A4150" }} className="tnum">{done}/{total}</span>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const m = statusMeta(label);
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>
      {label}
    </span>
  );
}

export default async function ReportsPage() {
  const user = await requireUser();
  const isManager = user.role === "group_leader" || user.role === "admin";
  const today = todayKstISO();

  if (isManager) {
    const groupId = user.role === "admin" ? null : user.group_id;
    const rows = await listScopeReports({ groupId, date: today });
    const submitted = rows.filter((r) => ["검수대기", "승인", "반려", "재제출", "제출완료"].includes(r.status)).length;
    const notWritten = rows.filter((r) => r.status === "미작성" || r.status === "작성중").length;
    const delayed = rows.filter((r) => r.delayed > 0).length;
    const pending = rows.filter((r) => r.status === "검수대기").length;
    const stats = [
      { label: "오늘 제출", value: `${submitted}/${rows.length}명`, color: "#1A1F2B" },
      { label: "미제출", value: `${notWritten}명`, color: "#DC2626" },
      { label: "지연", value: `${delayed}건`, color: "#DC2626" },
      { label: "검수 대기", value: `${pending}건`, color: "#B7860B" },
    ];

    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>팀 보고 현황</div>
        <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 22 }}>
          {user.role === "admin" ? "전체 팀" : user.group_name} · {today} 제출·검수 상태
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }} className="stat-grid">
          {stats.map((s) => (
            <div key={s.label} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: s.color }} className="tnum">{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="mgr-table">
            <thead>
              <tr style={{ background: "#F7F8FA" }}>
                {["직원", "상태", "완결율", "지연", "제출시각", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: MgrRow) => (
                <tr key={r.user_id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="mgr-row">
                  <td style={{ padding: "13px 16px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#9AA1AE" }}>{r.dept}</div>
                  </td>
                  <td style={{ padding: "13px 16px" }}><Badge label={r.status} /></td>
                  <td style={{ padding: "13px 16px" }}><Bar done={r.done} total={r.total} /></td>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: r.delayed > 0 ? "#DC2626" : "#1F9254" }}>
                      {r.delayed > 0 ? `지연 ${r.delayed}` : "정상"}
                    </span>
                  </td>
                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{timeOf(r.submitted_at)}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right" }}>
                    {r.report_id ? (
                      <Link href={`/review/${r.report_id}`} data-testid={`row-action-${r.user_id}`} style={{ border: r.status === "검수대기" ? "none" : "1px solid #CBD0D9", background: r.status === "검수대기" ? "#3B5BDB" : "#fff", color: r.status === "검수대기" ? "#fff" : "#3A4150", borderRadius: 7, fontSize: 12, fontWeight: 600, padding: "6px 14px", textDecoration: "none" }}>
                        {r.status === "검수대기" ? "검수" : "보기"}
                      </Link>
                    ) : (
                      <span style={{ color: "#CBD0D9" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 직원 뷰
  const rows = await listMyReports(user.id);
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>내 보고서</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 22 }}>내가 작성한 일일 업무 보고서</div>
      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="emp-table">
          <thead>
            <tr style={{ background: "#F7F8FA" }}>
              {["날짜", "상태", "완결율", "지연", "제출시각"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.report_id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="emp-row">
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600 }} className="tnum">
                  <Link href={`/report/${r.report_date}`} style={{ color: "#1A1F2B", textDecoration: "none" }}>
                    {shortDate(r.report_date)} ({weekday(r.report_date)})
                  </Link>
                </td>
                <td style={{ padding: "13px 16px" }}><Badge label={r.status} /></td>
                <td style={{ padding: "13px 16px" }}><Bar done={r.done} total={r.total} /></td>
                <td style={{ padding: "13px 16px" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.delayed > 0 ? "#DC2626" : "#1F9254" }}>
                    {r.delayed > 0 ? `지연 ${r.delayed}` : "정상"}
                  </span>
                </td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{timeOf(r.submitted_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9AA1AE" }}>아직 작성한 보고서가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
