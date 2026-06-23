"use client";

import { useState, useRef, useEffect } from "react";

/**
 * 업무 설명(상세) 표시 박스 — 설명이 있을 때만. 작성/검수 화면 공용(읽기 전용).
 * - 라벨 없음(설명 텍스트만).
 * - 기본 3줄로 접고, 넘치면 우하단 '더보기/접기' 버튼으로 확대·축소.
 * - 폭은 부모가 결정(행에서 전체폭 컨테이너에 배치).
 */
export default function TaskDescBox({ desc }: { desc: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 2);
  }, [desc]);

  if (!desc || !desc.trim()) return null;

  const clamp: React.CSSProperties = expanded
    ? {}
    : { display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" };

  return (
    <div data-testid="task-desc" style={{ marginTop: 8, border: "1px solid #E8EAEF", background: "#F9FAFB", borderRadius: 8, padding: "9px 11px" }}>
      <div
        ref={ref}
        style={{ fontSize: 13, lineHeight: "20px", color: "#3A4150", whiteSpace: "pre-wrap", wordBreak: "break-word", ...clamp }}
      >
        {desc}
      </div>
      {(overflows || expanded) && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 7 }}>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            data-testid="desc-toggle"
            aria-expanded={expanded}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 26, padding: "0 11px", border: "1px solid #E2E5EB", borderRadius: 9999, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            {expanded ? "접기" : "더보기"}
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none" style={{ transform: expanded ? "rotate(180deg)" : "none" }}>
              <path d="M5 7.5l5 5 5-5" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
