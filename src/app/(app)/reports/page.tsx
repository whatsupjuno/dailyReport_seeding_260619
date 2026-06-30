import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import { listMyReports, listMyReportsRange, listScopeReports, listScopeReportsRange, listScopeReportsByStatus, listLedGroupIds, listReportIdsByTaskSearch, type MgrRow, type EmpRow } from "@/lib/data/list";
import { listGroupOptions } from "@/lib/data/admin";
import { userHasOtherReviewer } from "@/lib/data/review";
import FilterBar from "./FilterBar";
import { statusMeta } from "@/lib/domain/status";
import { todayKstISO, shortDate, weekday } from "@/lib/date";

function timeOf(ts: string | null): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
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

type SP = Promise<{ tab?: string; q?: string; group?: string; date?: string; from?: string; to?: string; page?: string; sort?: string; mode?: string; reviewSort?: string }>;

const isISO = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

// 검수 열 정렬용 검수단계 순위(디자인 reviewRank): 승인 3 · 반려 2 · 검수대기/계획제출 1 · 그 외(검수 없음) 0
function reviewRankOf(status: string): number {
  if (status === "승인") return 3;
  if (status === "반려") return 2;
  if (status === "검수대기" || status === "계획제출") return 1;
  return 0;
}

// 목록 행 정렬(페이지네이션 슬라이스 전). reviewSort가 있으면 검수단계 우선, 없으면 sortBy(time/date).
// JS Array.sort는 안정 정렬이라 동률은 원래 순서(SQL: 날짜 DESC·이름)를 보존한다.
function sortRows<T extends { submitted_at: string | null; report_date: string | null; status: string }>(
  rows: T[], sort: string, reviewSort: string,
): T[] {
  const arr = rows.slice();
  if (reviewSort === "asc" || reviewSort === "desc") {
    const dir = reviewSort === "asc" ? 1 : -1;
    arr.sort((a, b) => dir * (reviewRankOf(a.status) - reviewRankOf(b.status)));
  } else if (sort === "time") {
    arr.sort((a, b) => {
      const ta = a.submitted_at ? Date.parse(a.submitted_at) : NaN;
      const tb = b.submitted_at ? Date.parse(b.submitted_at) : NaN;
      const na = Number.isNaN(ta), nb = Number.isNaN(tb);
      if (na && nb) return 0;
      if (na) return 1; // 미제출(제출시각 null)은 맨 뒤
      if (nb) return -1;
      return tb - ta; // 최근 제출 먼저
    });
  } else {
    // date: 최근 날짜 먼저
    arr.sort((a, b) => {
      const da = a.report_date ?? "", db = b.report_date ?? "";
      return da === db ? 0 : da < db ? 1 : -1;
    });
  }
  return arr;
}

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const isManager = user.role === "group_leader" || user.role === "admin";
  const today = todayKstISO();
  // 날짜 범위 from~to. 구버전 ?date= 도 호환. 기본값=오늘(today~today). from>to면 스왑.
  const f0 = isISO(sp.from) ? sp.from : isISO(sp.date) ? sp.date : today;
  const t0 = isISO(sp.to) ? sp.to : isISO(sp.date) ? sp.date : f0;
  const from = f0 <= t0 ? f0 : t0;
  const to = f0 <= t0 ? t0 : f0;
  const isSingleDay = from === to;
  const q = (sp.q ?? "").trim();
  const tab = sp.tab ?? "all";
  // 정렬 기준(기본 time=제출시각)·검수 열 정렬(asc|desc|없음)·검색 모드(기본 normal=키워드)
  const sort = sp.sort === "date" ? "date" : "time";
  const reviewSort = sp.reviewSort === "asc" || sp.reviewSort === "desc" ? sp.reviewSort : "";
  const mode = sp.mode === "context" ? "context" : "normal";
  // 검수 열 헤더 클릭 순환: 없음 → asc → desc → 없음. 아이콘/색.
  const nextReviewSort = reviewSort === "asc" ? "desc" : reviewSort === "desc" ? "" : "asc";
  const reviewSortIcon = reviewSort === "asc" ? "▲" : reviewSort === "desc" ? "▼" : "⇅";
  const reviewSortColor = reviewSort ? "#3B5BDB" : "#B7BCC7";
  // 일반(키워드) 검색: 업무 내용(제목·설명·프로젝트)이 매칭되는 보고서 id 집합. 문맥 모드는 미동작(준비 중)이라 검색 미적용.
  const taskMatchIds = q && mode !== "context" ? new Set(await listReportIdsByTaskSearch(q)) : null;

  if (isManager) {
    // admin: 전체(또는 필터). group_leader: 자신이 그룹장인 모든 그룹(복수 그룹장 지원).
    const groupIds = user.role === "admin" ? (sp.group ? [Number(sp.group)] : null) : await listLedGroupIds(user.id);
    const groups = user.role === "admin" ? await listGroupOptions() : [];
    const all = isSingleDay
      ? await listScopeReports({ groupIds, date: from }) // 단일일: 스냅샷(미작성 포함, KPI용)
      : await listScopeReportsRange({ groupIds, from, to }); // 여러 날: 존재하는 보고서만
    // '승인' 탭은 날짜 무관(최근 누적) — 과거에 검수 완료(승인)한 보고서도 목록에서 볼 수 있게.
    const approvedAll = await listScopeReportsByStatus({ groupIds, statuses: ["승인"], limit: 300 });
    const isApprovedView = tab === "approved";
    // 본인 행: 위/동급 검수자가 없으면(최상위) 본인 보고서를 직접 검수(셀프 승인) 가능 → '검수' 노출. 아니면 '보기'(내 보고서 편집).
    const selfReviewAllowed = !(await userHasOtherReviewer({ id: user.id, group_id: user.group_id }));

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
      { k: "approved", label: "승인", n: approvedAll.length },
    ];
    const extraQs = `${q ? `&q=${encodeURIComponent(q)}` : ""}${sp.group ? `&group=${sp.group}` : ""}${sort !== "time" ? `&sort=${sort}` : ""}${mode !== "normal" ? `&mode=${mode}` : ""}`;
    const qs = (k: string, pg = 1, rs: string = reviewSort) => `?tab=${k}&from=${from}&to=${to}&page=${pg}${extraQs}${rs ? `&reviewSort=${rs}` : ""}`;

    // KPI 집계
    const totalN = all.length;
    const submittedN = all.filter((r) => ["검수대기", "승인", "반려", "재제출", "제출완료"].includes(r.status)).length;
    const submittedPct = totalN > 0 ? Math.round((submittedN / totalN) * 100) : 0;
    const notSubmittedN = cnt((r) => r.status === "미작성" || r.status === "작성중");
    const delayN = cnt((r) => r.delayed > 0);
    const pendingN = cnt((r) => r.status === "검수대기");
    const kpis = [
      { label: "오늘 제출", value: `${submittedN}/${totalN}명`, color: "#1A1F2B", icon: "", sub: `진행률 ${submittedPct}%`, bar: submittedPct as number | undefined },
      { label: "미제출", value: `${notSubmittedN}명`, color: "#DC2626", icon: "", sub: "독려가 필요해요", bar: undefined },
      { label: "지연", value: `${delayN}건`, color: "#DC2626", icon: "❗", sub: "마감 초과", bar: undefined },
      { label: "검수 대기", value: `${pendingN}건`, color: "#B7860B", icon: "⌛", sub: "확인이 필요해요", bar: undefined },
    ];

    // 검색(일반): 이름·부서 또는 업무 내용(taskMatchIds) 매칭. 문맥 모드는 미동작이라 q 무시.
    const matchSearch = (r: MgrRow): boolean => {
      if (!q || mode === "context") return true;
      return r.name.includes(q) || (r.dept ?? "").includes(q) || (r.report_id != null && taskMatchIds!.has(r.report_id));
    };
    // 페이지네이션. 승인 탭은 날짜 무관(approvedAll), 그 외는 단일-날짜 스냅샷.
    const PAGE = 12;
    const filtered = sortRows((isApprovedView ? approvedAll : all.filter(matchTab)).filter(matchSearch), sort, reviewSort);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
    const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), pageCount);
    const rows = filtered.slice((page - 1) * PAGE, page * PAGE);

    const reviewCell = (status: string) => {
      const m: Record<string, [string, string, string]> = { 검수대기: ["대기", "#B7860B", "#FBF4DA"], 승인: ["승인", "#1F7A46", "#E7F5EC"], 반려: ["반려", "#B91C1C", "#FCEBEB"], 계획제출: ["계획", "#2563EB", "#E6EEFD"] };
      const v = m[status];
      return v ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, color: v[1], background: v[2] }}>{v[0]}</span> : <span style={{ color: "#CBD0D9" }}>—</span>;
    };

    return (
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>팀 보고 현황</div>
        <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 20 }}>{isApprovedView ? "승인 완료된 보고서를 날짜와 관계없이 모아 볼 수 있어요." : "오늘 팀의 제출·검수 상태를 한눈에 확인하세요."}</div>

        {/* KPI 4카드 */}
        <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }} data-testid="kpi-grid">
          {kpis.map((k) => (
            <div key={k.label} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>{k.icon ? `${k.icon} ` : ""}{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: k.color, marginTop: 6 }} className="tnum">{k.value}</div>
              {k.bar !== undefined ? (
                <div style={{ height: 6, background: "#EFF1F5", borderRadius: 9999, overflow: "hidden", marginTop: 10 }}><div style={{ height: "100%", width: `${k.bar}%`, background: "#3B5BDB" }} /></div>
              ) : null}
              <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: k.bar !== undefined ? 6 : 10 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* 탭 + 필터 + 테이블 단일 카드 */}
        <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid #E2E5EB", padding: "4px 16px 0" }}>
            {tabs.map((t) => {
              const on = tab === t.k;
              return (
                <Link key={t.k} href={qs(t.k)} style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: 14, fontWeight: 600, color: on ? "#3B5BDB" : "#6B7280", padding: "10px 8px", borderBottom: `2px solid ${on ? "#3B5BDB" : "transparent"}`, whiteSpace: "nowrap" }}>
                  {t.label}<span style={{ fontSize: 11, fontWeight: 700, background: on ? "#EEF2FF" : "#F1F2F4", color: on ? "#2F49B0" : "#6B7280", borderRadius: 9999, padding: "1px 7px" }} className="tnum">{t.n}</span>
                </Link>
              );
            })}
          </div>
          <FilterBar tab={tab} from={from} to={to} q={q} group={sp.group ?? ""} isAdmin={user.role === "admin"} isManager={true} groups={groups} today={today} sort={sort} mode={mode} reviewSort={reviewSort} hideDate={isApprovedView} />
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }} data-testid="mgr-table">
            <thead><tr style={{ background: "#F7F8FA", borderTop: "1px solid #E2E5EB" }}>
              {["직원", "날짜", "상태", "검수", "완결율", "지연", "제출시각", ""].map((h, i) => (
                <th key={i} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>
                  {h === "검수" ? (
                    <Link href={qs(tab, 1, nextReviewSort)} data-testid="review-sort-toggle" aria-label="검수 단계로 정렬" style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", color: "#6B7280", fontSize: 12, fontWeight: 600 }}>
                      검수<span style={{ fontSize: 11, lineHeight: 1, color: reviewSortColor }}>{reviewSortIcon}</span>
                    </Link>
                  ) : h}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const isOwn = r.user_id === user.id;
                const pending = r.status === "검수대기";
                const review = pending && (!isOwn || selfReviewAllowed);
                const rowDate = r.report_date ?? from;
                const href = isOwn && !review ? `/report/${rowDate}` : `/review/${r.report_id}`;
                return (
                <tr key={r.user_id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="mgr-row">
                  <td style={{ padding: "13px 16px" }}><div style={{ fontSize: 13, fontWeight: 600 }}>{r.name}{isOwn ? <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", marginLeft: 6 }}>· 나</span> : null}</div><div style={{ fontSize: 11, color: "#9AA1AE" }}>{r.dept}</div></td>
                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{shortDate(rowDate)} ({weekday(rowDate)})</td>
                  <td style={{ padding: "13px 16px" }}><Badge label={r.status} /></td>
                  <td style={{ padding: "13px 16px" }}>{reviewCell(r.status)}</td>
                  <td style={{ padding: "13px 16px" }}><Bar done={r.done} total={r.total} /></td>
                  <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, fontWeight: 600, color: r.delayed > 0 ? "#DC2626" : "#1F9254" }}>{r.delayed > 0 ? `지연 ${r.delayed}` : "정상"}</span></td>
                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{timeOf(r.submitted_at)}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right" }}>
                    {r.report_id ? (
                      <Link href={href} data-testid={`row-action-${r.user_id}`} style={{ border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150", borderRadius: 7, fontSize: 12, fontWeight: 600, padding: "6px 12px", textDecoration: "none", whiteSpace: "nowrap" }}>상세 ›</Link>
                    ) : <span style={{ color: "#CBD0D9" }}>—</span>}
                  </td>
                </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#9AA1AE" }}>해당 조건의 보고서가 없습니다.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>

        {/* 총건수 + 페이지네이션 */}
        <div style={{ display: "flex", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#6B7280" }}>총 {filtered.length}건</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Link href={qs(tab, Math.max(1, page - 1))} aria-label="이전 페이지" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E2E5EB", borderRadius: 8, color: page <= 1 ? "#CBD0D9" : "#3A4150", textDecoration: "none", background: "#fff", pointerEvents: page <= 1 ? "none" : "auto" }}>‹</Link>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((pg) => (
              <Link key={pg} href={qs(tab, pg)} style={{ minWidth: 32, height: 32, padding: "0 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${pg === page ? "#3B5BDB" : "#E2E5EB"}`, borderRadius: 8, color: pg === page ? "#fff" : "#3A4150", background: pg === page ? "#3B5BDB" : "#fff", fontWeight: 600, fontSize: 13, textDecoration: "none" }} className="tnum">{pg}</Link>
            ))}
            <Link href={qs(tab, Math.min(pageCount, page + 1))} aria-label="다음 페이지" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E2E5EB", borderRadius: 8, color: page >= pageCount ? "#CBD0D9" : "#3A4150", textDecoration: "none", background: "#fff", pointerEvents: page >= pageCount ? "none" : "auto" }}>›</Link>
          </div>
        </div>
      </div>
    );
  }

  // 직원 뷰
  const allMine = await listMyReports(user.id); // 반려 배너(최근 전체 기준 — 날짜필터와 무관하게 놓치지 않도록)
  const myRange = await listMyReportsRange(user.id, from, to); // 기간 내 보고서(목록·탭 카운트)
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
    { k: "all", label: "전체", n: myRange.length },
    { k: "draft", label: "작성중", n: myRange.filter((r) => r.status === "작성중" || r.status === "미작성").length },
    { k: "submitted", label: "제출완료", n: myRange.filter((r) => ["검수대기", "제출완료", "재제출"].includes(r.status)).length },
    { k: "rejected", label: "반려", n: myRange.filter((r) => r.status === "반려").length },
    { k: "approved", label: "승인", n: myRange.filter((r) => r.status === "승인").length },
  ];
  const rejectedN = allMine.filter((r) => r.status === "반려").length;

  // 직원 검색(일반): 업무 내용(taskMatchIds) 매칭. 문맥 모드는 미동작이라 q 무시.
  const empMatchSearch = (r: EmpRow): boolean => {
    if (!q || mode === "context") return true;
    return taskMatchIds!.has(r.report_id);
  };
  const empFiltered = sortRows(myRange.filter((r) => matchTab(r.status)).filter(empMatchSearch), sort, reviewSort);
  const PAGE = 12;
  const empPageCount = Math.max(1, Math.ceil(empFiltered.length / PAGE));
  const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), empPageCount);
  const rows = empFiltered.slice((page - 1) * PAGE, page * PAGE);

  const empExtraQs = `${q ? `&q=${encodeURIComponent(q)}` : ""}${sort !== "time" ? `&sort=${sort}` : ""}${mode !== "normal" ? `&mode=${mode}` : ""}`;
  const qs = (k: string, pg = 1, rs: string = reviewSort) => `?tab=${k}&from=${from}&to=${to}&page=${pg}${empExtraQs}${rs ? `&reviewSort=${rs}` : ""}`;
  const reviewCell = (status: string) => {
    const m: Record<string, [string, string, string]> = { 검수대기: ["대기", "#B7860B", "#FBF4DA"], 승인: ["승인", "#1F7A46", "#E7F5EC"], 반려: ["반려", "#B91C1C", "#FCEBEB"], 계획제출: ["계획", "#2563EB", "#E6EEFD"] };
    const v = m[status];
    return v ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 9999, color: v[1], background: v[2] }}>{v[0]}</span> : <span style={{ color: "#CBD0D9" }}>—</span>;
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>내 보고서</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 16 }}>내가 작성한 일일 업무 보고서를 확인할 수 있어요.</div>

      {rejectedN > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }} data-testid="reject-banner">
          <span style={{ color: "#B91C1C", fontWeight: 700 }}>↩</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#B91C1C" }}>반려된 보고서가 {rejectedN}건 있어요. 사유를 확인하고 재작성해 주세요.</span>
        </div>
      )}

      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid #E2E5EB", padding: "4px 16px 0" }}>
          {tabs.map((t) => {
            const on = tab === t.k;
            return (
              <Link key={t.k} href={qs(t.k)} style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", fontSize: 14, fontWeight: 600, color: on ? "#3B5BDB" : "#6B7280", padding: "10px 8px", borderBottom: `2px solid ${on ? "#3B5BDB" : "transparent"}`, whiteSpace: "nowrap" }}>
                {t.label}<span style={{ fontSize: 11, fontWeight: 700, background: on ? "#EEF2FF" : "#F1F2F4", color: on ? "#2F49B0" : "#6B7280", borderRadius: 9999, padding: "1px 7px" }} className="tnum">{t.n}</span>
              </Link>
            );
          })}
        </div>
        <FilterBar tab={tab} from={from} to={to} q={q} group="" isAdmin={false} isManager={false} groups={[]} today={today} sort={sort} mode={mode} reviewSort={reviewSort} />
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }} data-testid="emp-table">
          <thead><tr style={{ background: "#F7F8FA", borderTop: "1px solid #E2E5EB" }}>{["날짜", "상태", "검수", "완결율", "지연", "제출시각"].map((h) => (
            <th key={h} style={{ textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>
              {h === "검수" ? (
                <Link href={qs(tab, 1, nextReviewSort)} data-testid="review-sort-toggle" aria-label="검수 단계로 정렬" style={{ display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", color: "#6B7280", fontSize: 12, fontWeight: 600 }}>
                  검수<span style={{ fontSize: 11, lineHeight: 1, color: reviewSortColor }}>{reviewSortIcon}</span>
                </Link>
              ) : h}
            </th>
          ))}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.report_id} style={{ borderTop: "1px solid #E2E5EB" }} data-testid="emp-row">
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600 }} className="tnum"><Link href={`/report/${r.report_date}`} style={{ color: "#1A1F2B", textDecoration: "none" }}>{shortDate(r.report_date)} ({weekday(r.report_date)})</Link></td>
                <td style={{ padding: "13px 16px" }}><Badge label={r.status} /></td>
                <td style={{ padding: "13px 16px" }}>{reviewCell(r.status)}</td>
                <td style={{ padding: "13px 16px" }}><Bar done={r.done} total={r.total} /></td>
                <td style={{ padding: "13px 16px" }}><span style={{ fontSize: 12, fontWeight: 600, color: r.delayed > 0 ? "#DC2626" : "#1F9254" }}>{r.delayed > 0 ? `지연 ${r.delayed}` : "정상"}</span></td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#6B7280" }} className="tnum">{timeOf(r.submitted_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#9AA1AE" }}>해당 조건의 보고서가 없습니다.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>총 {empFiltered.length}건</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Link href={qs(tab, Math.max(1, page - 1))} aria-label="이전 페이지" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E2E5EB", borderRadius: 8, color: page <= 1 ? "#CBD0D9" : "#3A4150", textDecoration: "none", background: "#fff", pointerEvents: page <= 1 ? "none" : "auto" }}>‹</Link>
          {Array.from({ length: empPageCount }, (_, i) => i + 1).map((pg) => (
            <Link key={pg} href={qs(tab, pg)} style={{ minWidth: 32, height: 32, padding: "0 8px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${pg === page ? "#3B5BDB" : "#E2E5EB"}`, borderRadius: 8, color: pg === page ? "#fff" : "#3A4150", background: pg === page ? "#3B5BDB" : "#fff", fontWeight: 600, fontSize: 13, textDecoration: "none" }} className="tnum">{pg}</Link>
          ))}
          <Link href={qs(tab, Math.min(empPageCount, page + 1))} aria-label="다음 페이지" style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #E2E5EB", borderRadius: 8, color: page >= empPageCount ? "#CBD0D9" : "#3A4150", textDecoration: "none", background: "#fff", pointerEvents: page >= empPageCount ? "none" : "auto" }}>›</Link>
        </div>
      </div>
    </div>
  );
}
