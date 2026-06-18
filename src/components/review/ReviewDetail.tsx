"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusMeta } from "@/lib/domain/status";

export interface ReviewView {
  reportId: number;
  reviewerName: string;
  ownerName: string;
  dept: string | null;
  dateLabel: string;
  status: string;
  isVacation: boolean;
  vacationType: string | null;
  nightReason: string | null;
  dailyComment: string | null;
  pending: boolean;
  sections: Array<{
    kind: string;
    name: string;
    status: string;
    tasks: Array<{ title: string; project: string | null; status: string; plannedMin: number | null; actualMin: number | null; hold: string | null }>;
  }>;
  comms: Array<{ type: string; counterpart: string; time: string | null; summary: string }>;
  events: Array<{ kind: string; actorName: string | null; comment: string | null; rejectTarget: string | null; at: string }>;
}

const EVENT_LABEL: Record<string, string> = { submitted: "제출", rejected: "반려", resubmitted: "재제출", approved: "승인" };
const REJECT_TEMPLATES = ["일정 누락", "근거 불충분", "완결 처리 오류", "커뮤니케이션 기록 누락", "내용 구체화 필요"];

function timeOf(ts: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}

export default function ReviewDetail({ view }: { view: ReviewView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [target, setTarget] = useState("전체");

  async function approve() {
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${view.reportId}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(data.error ?? "승인 실패"); return; }
      router.push("/review");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!comment.trim()) { alert("그룹장 코멘트를 입력해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${view.reportId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment, target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(data.error ?? "반려 실패"); return; }
      setRejectOpen(false);
      router.push("/review");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E5EB", height: 56, display: "flex", alignItems: "center", padding: "0 24px", gap: 14 }}>
        <a href="/review" style={{ fontSize: 13, fontWeight: 600, color: "#3B5BDB", textDecoration: "none" }}>← 목록으로</a>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#6B7280" }}>검수자 <strong style={{ color: "#3A4150" }}>{view.reviewerName}</strong></span>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 100px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }} className="review-grid">
        <div>
          {/* 헤더 카드 */}
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 9999, background: "#E0E7FF", color: "#2F49B0", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{view.ownerName.slice(0, 1)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{view.ownerName} <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 400 }}>{view.dept}</span></div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }} className="tnum">{view.dateLabel}</div>
              </div>
              <span data-testid="review-status" style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: statusMeta(view.status).bg, border: `1px solid ${statusMeta(view.status).line}`, color: statusMeta(view.status).main }}>{view.status}</span>
            </div>
          </div>

          {view.isVacation ? (
            <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>휴가일입니다 ({view.vacationType ?? "휴가"})</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>휴가 보고서도 확인이 필요합니다. 승인 또는 반려해 주세요.</div>
            </div>
          ) : (
            <>
              {view.nightReason && (
                <div style={{ background: "#FBF4DA", border: "1px solid #EFE0A6", borderLeft: "3px solid #B7860B", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#8A6508" }}>🌙 야간 업무 사유</div>
                  <div style={{ fontSize: 13, color: "#6B5316", marginTop: 7 }}>{view.nightReason}</div>
                </div>
              )}
              {view.sections.filter((s) => s.tasks.length > 0).map((sec) => (
                <div key={sec.kind} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, marginBottom: 16, overflow: "hidden" }} data-testid={`review-section-${sec.kind}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{sec.name}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: statusMeta(sec.status).bg, border: `1px solid ${statusMeta(sec.status).line}`, color: statusMeta(sec.status).main }}>{sec.status}</span>
                  </div>
                  <div style={{ padding: "6px 18px 14px" }}>
                    {sec.tasks.map((t, i) => {
                      const m = statusMeta(t.status);
                      return (
                        <div key={i} style={{ display: "flex", gap: 10, padding: "11px 0", borderBottom: "1px solid #F2F3F6", boxShadow: t.status === "지연" ? "inset 3px 0 0 #DC2626" : "none" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status}</span>
                            </div>
                            {(t.plannedMin || t.actualMin) && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }} className="tnum">{t.plannedMin ? `계획 ${t.plannedMin}분` : ""}{t.actualMin ? ` / 실제 ${t.actualMin}분` : ""}</div>}
                            {t.hold && <div style={{ fontSize: 12, color: "#B45309", marginTop: 5 }}>지연 사유 · {t.hold}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {view.comms.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>커뮤니케이션 기록</div>
                  {view.comms.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid #F2F3F6" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 9999, padding: "3px 9px" }}>{c.type}</span>
                      <div><div style={{ fontSize: 13 }}><strong>{c.counterpart}</strong> · <span className="tnum" style={{ color: "#6B7280" }}>{c.time}</span></div><div style={{ fontSize: 13, color: "#3A4150" }}>{c.summary}</div></div>
                    </div>
                  ))}
                </div>
              )}

              {view.dailyComment && (
                <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px" }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>일일 코멘트</div>
                  <div style={{ borderLeft: "3px solid #E2E5EB", paddingLeft: 12, fontSize: 14, color: "#3A4150" }}>{view.dailyComment}</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 사이드 */}
        <div>
          {/* AI 분석 (v1 미개발) */}
          <div style={{ background: "#F3F0FE", border: "1px solid #E4DCFB", borderLeft: "3px solid #7C5CFC", borderRadius: 12, padding: 18, marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#5B3FD1" }}>✦ AI 분석 결과</div>
            <div style={{ fontSize: 11, color: "#8B7FC4", marginTop: 3 }}>이번 버전 미개발 · 영역 예약</div>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {["효율성", "연속성", "연관성"].map((k) => (
                <div key={k}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA1AE", marginBottom: 6 }}><span>{k}</span><span>—</span></div>
                  <div style={{ height: 6, background: "#EAE3FC", borderRadius: 9999 }} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "#8B7FC4", marginTop: 14 }}>효율성·연속성·연관성 분석은 다음 버전에서 제공됩니다. 검수는 AI 없이도 진행할 수 있어요.</div>
          </div>

          {/* 검수 이력 */}
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>검수 이력</div>
            {view.events.length === 0 && <div style={{ fontSize: 13, color: "#9AA1AE" }}>이력이 없습니다.</div>}
            {view.events.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 9999, marginTop: 4, background: e.kind === "rejected" ? "#DC2626" : e.kind === "approved" ? "#1F9254" : "#2563EB" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: e.kind === "rejected" ? "#DC2626" : "#1A1F2B" }}>{EVENT_LABEL[e.kind] ?? e.kind}</div>
                  <div style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{timeOf(e.at)}{e.actorName ? ` · ${e.actorName}` : ""}</div>
                  {e.comment && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{e.rejectTarget ? `[${e.rejectTarget}] ` : ""}{e.comment}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 액션바 */}
      {view.pending && (
        <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.94)", borderTop: "1px solid #E2E5EB", padding: "12px 24px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }} />
            <button onClick={() => setRejectOpen(true)} disabled={busy} data-testid="reject-open" style={{ height: 44, padding: "0 22px", border: "1px solid #F5C2C2", borderRadius: 8, background: "#fff", color: "#DC2626", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>반려</button>
            <button onClick={approve} disabled={busy} data-testid="approve" style={{ height: 44, padding: "0 28px", border: "none", borderRadius: 8, background: "#1F9254", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>승인</button>
          </div>
        </div>
      )}

      {/* 반려 모달 */}
      {rejectOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #EFF1F5" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>보고서 반려</span>
              <button onClick={() => setRejectOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA1AE", fontSize: 20 }}>✕</button>
            </div>
            <div style={{ padding: "18px 22px" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 8 }}>자주 쓰는 사유</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {REJECT_TEMPLATES.map((t) => (
                  <button key={t} onClick={() => setComment(t)} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 9999, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3A4150" }}>{t}</button>
                ))}
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>대상 지목</label>
              <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="reject-target" style={{ width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 14, marginBottom: 16, background: "#fff" }}>
                {["전체", "오전", "오후", "야간"].map((t) => <option key={t}>{t}</option>)}
              </select>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>그룹장 코멘트 <span style={{ color: "#DC2626" }}>*</span></label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} data-testid="reject-comment" placeholder="예) 오후 업무 계획이 누락되었습니다. 14시 이후 일정을 추가해 주세요." style={{ width: "100%", minHeight: 96, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 22px", borderTop: "1px solid #EFF1F5" }}>
              <button onClick={() => setRejectOpen(false)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={reject} disabled={busy} data-testid="reject-submit" style={{ height: 40, padding: "0 18px", border: "none", borderRadius: 8, background: comment.trim() ? "#DC2626" : "#E2E5EB", color: comment.trim() ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>반려하고 코멘트 전달</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
