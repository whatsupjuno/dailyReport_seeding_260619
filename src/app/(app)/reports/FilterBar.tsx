"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// 디자인(v5.0.3) 1:1: 프리셋(오늘/이번주/지난주/최근 한달/이번달/저번달) + 조회기간 두 달 캘린더 범위 + (관리자)그룹 + 검색
type Ymd = { y: number; m: number; d: number }; // m: 0-index

const pad2 = (n: number) => (n < 10 ? "0" : "") + n;
const isoOf = (o: Ymd) => `${o.y}-${pad2(o.m + 1)}-${pad2(o.d)}`;
const ymdOf = (iso: string): Ymd => { const [y, m, d] = iso.split("-").map(Number); return { y, m: m - 1, d }; };
const cmp = (a: Ymd | null, b: Ymd | null) => (!a || !b ? 0 : (a.y - b.y) || (a.m - b.m) || (a.d - b.d));
const eq = (a: Ymd | null, b: Ymd | null) => !!a && !!b && cmp(a, b) === 0;
const addMonths = (o: { y: number; m: number }, delta: number) => { const dt = new Date(o.y, o.m + delta, 1); return { y: dt.getFullYear(), m: dt.getMonth() }; };
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
function weekRange(t: Ymd, deltaWeeks: number) { // 월요일 시작
  const dt = new Date(t.y, t.m, t.d);
  const offset = (dt.getDay() + 6) % 7; // 0=월 … 6=일
  const mon = new Date(t.y, t.m, t.d - offset + deltaWeeks * 7);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { start: { y: mon.getFullYear(), m: mon.getMonth(), d: mon.getDate() }, end: { y: sun.getFullYear(), m: sun.getMonth(), d: sun.getDate() } };
}
// '전체' 프리셋의 넓은 시작일(이 이전 보고서는 없다고 보는 하한). end는 항상 오늘.
const ALL_START: Ymd = { y: 2000, m: 0, d: 1 };
function presetRange(key: string, t: Ymd): { start: Ymd; end: Ymd } {
  if (key === "all") return { start: { ...ALL_START }, end: { ...t } };
  if (key === "today") return { start: { ...t }, end: { ...t } };
  if (key === "thisweek") return weekRange(t, 0);
  if (key === "lastweek") return weekRange(t, -1);
  if (key === "recent") { const s = addMonths(t, -1); return { start: { y: s.y, m: s.m, d: Math.min(t.d, lastDay(s.y, s.m)) }, end: { ...t } }; }
  if (key === "this") return { start: { y: t.y, m: t.m, d: 1 }, end: { y: t.y, m: t.m, d: lastDay(t.y, t.m) } };
  const p = addMonths(t, -1); // prev (저번달)
  return { start: { y: p.y, m: p.m, d: 1 }, end: { y: p.y, m: p.m, d: lastDay(p.y, p.m) } };
}
const PRESETS = [
  { key: "all", label: "전체" },
  { key: "today", label: "오늘" }, { key: "thisweek", label: "이번주" }, { key: "lastweek", label: "지난주" },
  { key: "recent", label: "최근 한달" }, { key: "this", label: "이번달" }, { key: "prev", label: "저번달" },
];
function presetKeyOf(from: Ymd, to: Ymd, t: Ymd): string | null {
  for (const p of PRESETS) { const r = presetRange(p.key, t); if (eq(from, r.start) && eq(to, r.end)) return p.key; }
  return null;
}

export default function FilterBar({
  tab, from, to, q, group, isAdmin, isManager, groups, today, sort, mode, reviewSort, hideDate = false,
}: {
  tab: string; from: string; to: string; q: string; group: string; isAdmin: boolean; isManager: boolean;
  groups: Array<{ id: number; name: string }>; today: string;
  sort: string; mode: string; reviewSort: string; hideDate?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [open, setOpen] = useState(false);
  const t = ymdOf(today);
  const fromY = ymdOf(from), toY = ymdOf(to);
  const [calLeft, setCalLeft] = useState(() => ({ y: fromY.y, m: fromY.m }));
  // 캘린더에서 고르는 중인 임시 범위(start만 고른 상태 포함)
  const [pick, setPick] = useState<{ start: Ymd | null; end: Ymd | null }>({ start: fromY, end: toY });
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function nav(nextFrom: string, nextTo: string, extra?: Partial<{ group: string; q: string; sort: string; mode: string }>) {
    const p = new URLSearchParams();
    p.set("tab", tab); p.set("from", nextFrom); p.set("to", nextTo);
    const g = extra?.group ?? group; if (g) p.set("group", g);
    const query = extra?.q ?? search; if (query.trim()) p.set("q", query.trim());
    const s = extra?.sort ?? sort; if (s && s !== "time") p.set("sort", s); // 기본 time은 URL 생략
    const m = extra?.mode ?? mode; if (m && m !== "normal") p.set("mode", m); // 기본 normal은 URL 생략
    if (reviewSort) p.set("reviewSort", reviewSort); // 검수 열 정렬 상태 보존
    router.push(`/reports?${p.toString()}`);
  }

  function onPreset(key: string) { const r = presetRange(key, t); setOpen(false); nav(isoOf(r.start), isoOf(r.end)); }
  function onPickDay(c: Ymd) {
    if (!pick.start || pick.end) { setPick({ start: c, end: null }); return; } // 시작 선택
    let start = pick.start, end = c; if (cmp(end, start) < 0) { const tmp = start; start = end; end = tmp; }
    setPick({ start, end }); setOpen(false); nav(isoOf(start), isoOf(end));
  }

  const pk = presetKeyOf(fromY, toY, t);
  const dateLabel = `${from} ~ ${to}`;
  const sel: React.CSSProperties = { height: 38, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 32px 0 12px", fontFamily: "inherit", fontSize: 13, color: "#3A4150", background: "#fff", cursor: "pointer" };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "14px 16px", flexWrap: "wrap" }} data-testid="filter-bar">
      {!hideDate && (
        <>
          <div style={{ display: "inline-flex", gap: 2, background: "#F4F5F7", borderRadius: 9999, padding: 3 }} data-testid="date-presets">
            {PRESETS.map((p) => {
              const on = pk === p.key;
              return (
                <button key={p.key} onClick={() => onPreset(p.key)} data-testid={`preset-${p.key}`} aria-pressed={on}
                  style={{ border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: on ? 700 : 500, padding: "6px 12px", borderRadius: 9999, background: on ? "#fff" : "transparent", color: on ? "#2F49B0" : "#6B7280", boxShadow: on ? "0 1px 2px rgba(16,24,40,.12)" : "none" }}>{p.label}</button>
              );
            })}
          </div>
          <div ref={popRef} style={{ position: "relative" }}>
            <button onClick={() => { if (!open) { setPick({ start: fromY, end: toY }); setCalLeft({ y: fromY.y, m: fromY.m }); } setOpen((v) => !v); }} data-testid="date-range-toggle"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 38, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>
              <span>📅</span><span style={{ color: "#9AA1AE" }}>조회기간</span><span className="tnum" style={{ fontWeight: 600 }}>{dateLabel}</span><span style={{ color: "#9AA1AE" }}>▾</span>
            </button>
            {open && (
              <div data-testid="date-range-popover" style={{ position: "absolute", top: 44, left: 0, zIndex: 60, background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, boxShadow: "0 12px 28px rgba(16,24,40,.16)", padding: 16, display: "flex", gap: 18 }}>
                {[calLeft, addMonths(calLeft, 1)].map((ym, ci) => (
                  <Calendar key={ci} ym={ym} pick={pick} today={t} onShift={ci === 0 ? (d: number) => setCalLeft((c) => addMonths(c, d)) : undefined} onPickDay={onPickDay} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {isAdmin && (
        <select value={group} onChange={(e) => nav(from, to, { group: e.target.value })} style={sel} data-testid="group-select">
          <option value="">전체 그룹</option>
          {groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
      )}
      {/* 검색 모드 토글: 일반(키워드) / 문맥(시맨틱 — 준비 중 placeholder) */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 3, background: "#F1F3F7", border: "1px solid #E2E5EB", borderRadius: 9, flex: "none" }} data-testid="search-mode-toggle">
        {[{ m: "normal", label: "일반" }, { m: "context", label: "문맥" }].map((o) => {
          const on = mode === o.m;
          return (
            <button key={o.m} type="button" data-mode={o.m} aria-pressed={on} onClick={() => nav(from, to, { mode: o.m })} data-testid={`search-mode-${o.m}`}
              style={{ border: "none", background: on ? "#fff" : "transparent", color: on ? "#2F49B0" : "#6B7280", fontWeight: on ? 700 : 500, fontFamily: "inherit", fontSize: 13, padding: "6px 14px", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap", boxShadow: on ? "0 1px 2px rgba(16,24,40,.12)" : "none" }}>{o.label}</button>
          );
        })}
      </div>
      <div style={{ flex: 1, minWidth: 120, position: "relative", display: "flex", alignItems: "center" }}>
        <span aria-hidden style={{ position: "absolute", left: 12, color: "#9AA1AE", fontSize: 14, pointerEvents: "none" }}>🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") nav(from, to); }}
          placeholder={isManager ? "이름·업무 내용으로 검색" : "업무 내용으로 검색"} aria-label="검색" data-testid="search-input"
          style={{ width: "100%", height: 38, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px 0 34px", fontFamily: "inherit", fontSize: 13, color: "#3A4150", outline: "none", boxSizing: "border-box" }} />
      </div>
      {/* 정렬 기준: 제출시각 / 날짜 */}
      <select value={sort} onChange={(e) => nav(from, to, { sort: e.target.value })} style={{ ...sel, fontWeight: 600 }} data-testid="sort-select" aria-label="정렬 기준">
        <option value="time">제출시각</option>
        <option value="date">날짜</option>
      </select>
      {mode === "context" && (
        <div style={{ flexBasis: "100%", fontSize: 12, color: "#9AA1AE", marginTop: 2 }} data-testid="search-mode-note">
          문맥(시맨틱) 검색은 준비 중이에요. 지금은 일반(키워드) 검색을 이용해 주세요.
        </div>
      )}
    </div>
  );
}

function Calendar({ ym, pick, today, onShift, onPickDay }: { ym: { y: number; m: number }; pick: { start: Ymd | null; end: Ymd | null }; today: Ymd; onShift?: (d: number) => void; onPickDay: (c: Ymd) => void }) {
  const start = pick.start, end = pick.end;
  const lo = start && end ? (cmp(start, end) <= 0 ? start : end) : start;
  const hi = start && end ? (cmp(start, end) <= 0 ? end : start) : end;
  const cells: Array<Ymd & { other: boolean }> = [];
  const startDow = new Date(ym.y, ym.m, 1).getDay();
  for (let i = 0; i < 42; i++) { const dt = new Date(ym.y, ym.m, 1 - startDow + i); cells.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), other: dt.getMonth() !== ym.m }); }
  const dows = ["일", "월", "화", "수", "목", "금", "토"];
  return (
    <div style={{ width: 252 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, height: 24 }}>
        {onShift ? <button onClick={() => onShift(-1)} data-testid="cal-prev" style={calNav}>‹</button> : <span style={{ width: 24 }} />}
        <span style={{ fontSize: 14, fontWeight: 700 }} className="tnum">{ym.y}년 {ym.m + 1}월</span>
        {onShift ? <button onClick={() => onShift(1)} data-testid="cal-next" style={calNav}>›</button> : <span style={{ width: 24 }} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {dows.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, padding: "2px 0", color: i === 0 ? "#DC6B6B" : i === 6 ? "#4A77C9" : "#9AA1AE" }}>{w}</div>)}
        {cells.map((c, i) => {
          const isStart = !!lo && cmp(c, lo) === 0, isEnd = !!hi && cmp(c, hi) === 0;
          const inRange = !!lo && !!hi && cmp(c, lo) > 0 && cmp(c, hi) < 0;
          const single = !!lo && !!hi && cmp(lo, hi) === 0;
          const endpoint = (isStart || isEnd) && !c.other;
          const isToday = cmp(c, today) === 0;
          let band: React.CSSProperties = { padding: "2px 0" };
          if (!c.other && (inRange || ((isStart || isEnd) && !single))) {
            let radius = "0";
            if (isStart && !isEnd) radius = "999px 0 0 999px"; else if (isEnd && !isStart) radius = "0 999px 999px 0";
            band = { padding: "2px 0", background: "#E8EDFB", borderRadius: radius };
          }
          const btn: React.CSSProperties = { width: 32, height: 32, border: "none", background: endpoint ? "#3B5BDB" : "transparent", borderRadius: 999, fontFamily: "inherit", fontSize: 13, cursor: c.other ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", fontVariantNumeric: "tabular-nums", color: endpoint ? "#fff" : c.other ? "#C7CBD4" : "#3A4150", fontWeight: endpoint ? 700 : isToday && !c.other ? 700 : 400, boxShadow: !endpoint && isToday && !c.other ? "inset 0 0 0 1.5px #C3CEF3" : "none" };
          return <div key={i} style={band}><button disabled={c.other} onClick={() => onPickDay({ y: c.y, m: c.m, d: c.d })} style={btn} data-testid={c.other ? undefined : "cal-day"}>{c.d}</button></div>;
        })}
      </div>
    </div>
  );
}
const calNav: React.CSSProperties = { width: 24, height: 24, border: "1px solid #E2E5EB", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#6B7280", fontSize: 14 };
