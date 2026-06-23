"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 디자인: '오늘' 기간 select + '전체 직원' select + 🔍 검색(적용 버튼 없음 → 변경 즉시 반영)
export default function FilterBar({
  tab, date, q, group, isAdmin, groups, datePresets, hideDate = false,
}: {
  tab: string;
  date: string;
  q: string;
  group: string;
  isAdmin: boolean;
  groups: Array<{ id: number; name: string }>;
  datePresets: Array<{ value: string; label: string }>;
  hideDate?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);

  function go(next: Partial<{ date: string; group: string; q: string }>) {
    const p = new URLSearchParams();
    p.set("tab", tab);
    p.set("date", next.date ?? date);
    const g = next.group ?? group;
    if (g) p.set("group", g);
    const query = next.q ?? search;
    if (query.trim()) p.set("q", query.trim());
    router.push(`/reports?${p.toString()}`);
  }

  const sel: React.CSSProperties = { height: 38, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 32px 0 12px", fontFamily: "inherit", fontSize: 13, color: "#3A4150", background: "#fff", cursor: "pointer" };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "14px 16px", flexWrap: "wrap" }}>
      {!hideDate && (
        <select value={date} onChange={(e) => go({ date: e.target.value })} style={sel} data-testid="period-select">
          {datePresets.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      )}
      {isAdmin && (
        <select value={group} onChange={(e) => go({ group: e.target.value })} style={sel}>
          <option value="">전체 직원</option>
          {groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
      )}
      <div style={{ flex: 1, minWidth: 160, position: "relative", display: "flex", alignItems: "center" }}>
        <span aria-hidden style={{ position: "absolute", left: 12, color: "#9AA1AE", fontSize: 14, pointerEvents: "none" }}>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go({ q: search }); }}
          placeholder="이름·업무 내용으로 검색"
          aria-label="이름·업무 내용으로 검색"
          style={{ width: "100%", height: 38, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px 0 34px", fontFamily: "inherit", fontSize: 13, color: "#3A4150", outline: "none" }}
        />
      </div>
    </div>
  );
}
