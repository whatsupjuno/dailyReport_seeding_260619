import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listMyReports, listScopeReports, type MgrRow } from "@/lib/data/list";
import { listGroupOptions } from "@/lib/data/admin";
import { statusMeta } from "@/lib/domain/status";
import { todayKstISO, shortDate, weekday } from "@/lib/date";

function timeOf(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}
function validDate(s: string | undefined): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) ? s : todayKstISO();
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
  return <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{label}</span>;
}

const inputStyle: React.CSSProperties = { height: 36, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 13, color: "#3A4150", background: "#fff" };

type SP = Promise<{ tab?: string; q?: string; group?: string; date?: string }>;

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const isManager = user.role === "group_leader" || user.role === "admin";
  const date = validDate(sp.date);
  const q = (sp.q ?? "").trim();
  const tab = sp.tab ?? "all";

  if (isManager) {
    const groupFilter = user.role === "admin" ? (sp.group ? Number(sp.group) : null) : user.group_id;
    const groups = user.role === "admin" ? await listGroupOptions() : [];
    const all = await listScopeReports({ groupId: groupFilter, date });

    const matchTab = (r: MgrRow): boolean => {
      switch (tab) {
        case "none": return r.status === "미작성" || r.status === "작성중";
        case "delay": return r.delayed > 0;
        case "pending": return r.status === "검수대기";
        case "rejected": return r.status === "반려";
        case "approved": return r.status === "승인";
        default: return true;
      }
    };
    const cnt = (fn: (r: MgrRow) => boolean) => all.filter(fn).length;
    const tabs = [
      { k: "all", label: "전체", n: all.length },
      { k: "none", label: "미제출", n: cnt((r) => r.status === "미작성" || r.status === "작성중") },
      { k: "delay", label: "지연", n: cnt((r) => r.delayed > 0) },
      { k: "pending", label: "검수대기", n: cnt((r) => r.status === "검수대기") },
      { k: "rejected", label: "반려", n: cnt((r) => r.status === "반려") },
      { k: "approved", label: "승인", n: cnt((r) => r.status === "승인") },
    ];
    const rows = all.filter(matchTab).filter((r) => !q || r.name.includes(q) || (r.dept ?? "").includes(q));
    const qs = (k: string) => `?tab=${k}&date=${date}${q ? `&q=${encodeURIComponent(q)}` : ""}${sp.group ? `&group=${sp.group}` : ""}`;

    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>팀 보고 현황</div>
        <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 20 }}>{user.role === "admin" ? "전체 팀" : user.group_name} · {date}</div>

        {/* 필터 */}
        <form style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <input type="hidden" name="tab" value={tab} />
          <input type="date" name="date" defaultValue={date} style={inputStyle} />
          {user.role === "admin" && (
            <select name="group" defaultValue={sp.group ?? ""} style={inputStyle}>
              <option value="">전체 팀</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <input name="q" defaultValue={q} placeholder="이름·팀 검색" style={{ ...inputStyle, flex: 1, minWidth: 120 }} />
          <button style={{ ...inputStyle, background: "#3B5BDB", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer", padding: "0 16px" }}>적용</button>
        </form>

        {/* 탭 */}
        <div style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid #E2E5EB", marginBottom: 16 }}>
          {tabs.map((t) => {
            const on = tab === t.k;
            return (
              <Link key={t.k} href={qs(t.k)} style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: 14, fontWeight: 600, color: on ? "#3B5BDB" : "#6B7280", padding: "10px 8px", borderBottom: `2px solid ${on ? "#3B5BDB" : "transparent"}`, whiteSpace: "nowrap" }}>
                {t.label}<span style={{ fontSize: 11, fontWeight: 700, background: on ? "#EEF2FF" : "#F1F2F4", color: on ? "#2F49B0" : "#6B7280", borderRadius: 9999, padding: "1px 7px" }} className="tnum">{t.n}</span>
              </Link>
            );
          })}
        </div>

        <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="mgr-table">
            <thead><tr style={{ background: "#F7F8FA" }}>
              {["직원", "상태", "완결율", "지연", "제출시각", ""].map((h) => <th key={h} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="mgr-row">
                  <td style={{ padding: "13px 16px" }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: "#9AA1AE" }}>{r.dept}</div></td>
                  <td style={{ padding: "13px 16px" }}><Badge label={r.status} /></td>
                  <td style={{ padding: "13px 16px" }}><Bar done={r.done} total={r.total} /></td>
                  <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, fontWeight: 600, color: r.delayed > 0 ? "#DC2626" : "#1F9254" }}>{r.delayed > 0 ? `지연 ${r.delayed}` : "정상"}</span></td>
                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{timeOf(r.submitted_at)}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right" }}>
                    {r.report_id ? (
                      <Link href={`/review/${r.report_id}`} data-testid={`row-action-${r.user_id}`} style={{ border: r.status === "검수대기" ? "none" : "1px solid #CBD0D9", background: r.status === "검수대기" ? "#3B5BDB" : "#fff", color: r.status === "검수대기" ? "#fff" : "#3A4150", borderRadius: 7, fontSize: 12, fontWeight: 600, padding: "6px 14px", textDecoration: "none" }}>{r.status === "검수대기" ? "검수" : "보기"}</Link>
                    ) : <span style={{ color: "#CBD0D9" }}>—</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#9AA1AE" }}>해당 조건의 보고서가 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 직원 뷰
  const allMine = await listMyReports(user.id);
  const matchTab = (s: string) => {
    switch (tab) {
      case "draft": return s === "작성중" || s === "미작성";
      case "submitted": return s === "검수대기" || s === "제출완료" || s === "재제출";
      case "rejected": return s === "반려";
      case "approved": return s === "승인";
      default: return true;
    }
  };
  const tabs = [
    { k: "all", label: "전체", n: allMine.length },
    { k: "draft", label: "작성중", n: allMine.filter((r) => r.status === "작성중" || r.status === "미작성").length },
    { k: "submitted", label: "제출", n: allMine.filter((r) => ["검수대기", "제출완료", "재제출"].includes(r.status)).length },
    { k: "rejected", label: "반려", n: allMine.filter((r) => r.status === "반려").length },
    { k: "approved", label: "승인", n: allMine.filter((r) => r.status === "승인").length },
  ];
  const rows = allMine.filter((r) => matchTab(r.status));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>내 보고서</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 16 }}>내가 작성한 일일 업무 보고서</div>
      <div style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid #E2E5EB", marginBottom: 16 }}>
        {tabs.map((t) => {
          const on = tab === t.k;
          return (
            <Link key={t.k} href={`?tab=${t.k}`} style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: 14, fontWeight: 600, color: on ? "#3B5BDB" : "#6B7280", padding: "10px 8px", borderBottom: `2px solid ${on ? "#3B5BDB" : "transparent"}`, whiteSpace: "nowrap" }}>
              {t.label}<span style={{ fontSize: 11, fontWeight: 700, background: on ? "#EEF2FF" : "#F1F2F4", color: on ? "#2F49B0" : "#6B7280", borderRadius: 9999, padding: "1px 7px" }} className="tnum">{t.n}</span>
            </Link>
          );
        })}
      </div>
      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-testid="emp-table">
          <thead><tr style={{ background: "#F7F8FA" }}>{["날짜", "상태", "완결율", "지연", "제출시각"].map((h) => <th key={h} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.report_id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="emp-row">
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600 }} className="tnum"><Link href={`/report/${r.report_date}`} style={{ color: "#1A1F2B", textDecoration: "none" }}>{shortDate(r.report_date)} ({weekday(r.report_date)})</Link></td>
                <td style={{ padding: "13px 16px" }}><Badge label={r.status} /></td>
                <td style={{ padding: "13px 16px" }}><Bar done={r.done} total={r.total} /></td>
                <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, fontWeight: 600, color: r.delayed > 0 ? "#DC2626" : "#1F9254" }}>{r.delayed > 0 ? `지연 ${r.delayed}` : "정상"}</span></td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{timeOf(r.submitted_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#9AA1AE" }}>해당 조건의 보고서가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
