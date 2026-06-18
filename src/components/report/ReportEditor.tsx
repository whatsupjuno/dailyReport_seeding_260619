"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusMeta, type SectionKind, type WriteMode } from "@/lib/domain/status";
import { editableSections, stepperFor, writePrimaryLabel } from "@/lib/domain/report";

export interface ReportTask {
  id: number;
  project: string | null;
  title: string;
  status: string;
  planned_start: string | null;
  planned_duration_min: number | null;
  actual_duration_min: number | null;
  hold_reason: string | null;
}
export interface ReportSection {
  id: number;
  kind: SectionKind;
  status: string;
  locked: boolean;
  tasks: ReportTask[];
}
export interface ReportView {
  reportId: number;
  date: string;
  dateLabel: string;
  mode: WriteMode;
  status: string;
  isVacation: boolean;
  vacationType: string | null;
  nightHas: boolean;
  nightReason: string | null;
  dailyComment: string | null;
  noCommunication: boolean;
  submittedAt: string | null;
  sections: ReportSection[];
  comms: Array<{ id: number; type: string; counterpart: string; time: string | null; summary: string }>;
  events: Array<{ kind: string; actorName: string | null; comment: string | null; rejectTarget: string | null; at: string }>;
}

const SECTION_NAME: Record<SectionKind, string> = {
  plan: "오늘 계획",
  morning: "오전",
  afternoon: "오후",
  night: "야간",
};
const SECTION_RANGE: Record<SectionKind, string> = {
  plan: "08:30 ~ 11:50",
  morning: "08:30 ~ 11:50",
  afternoon: "11:50 ~ 17:50",
  night: "17:50 ~ 21:30",
};
const HEADER: Record<WriteMode, { title: string; sub: string }> = {
  morningPlan: { title: "오늘 업무 계획을 작성하세요", sub: "오늘 처리할 업무를 한 줄씩 추가해 주세요." },
  morningClose: { title: "오전 업무를 마감하고 오후 계획을 세워주세요", sub: "완결 여부와 실제 소요시간을 입력하면 오전이 잠깁니다." },
  afternoonClose: { title: "오후 업무를 마감하세요", sub: "완결 여부를 입력하고 오늘 보고를 제출해 주세요." },
  nightClose: { title: "야간 업무를 계획·마감해 주세요", sub: "야간 업무를 마감하고 최종 제출해 주세요." },
  vacation: { title: "오늘은 휴가로 처리할까요?", sub: "휴가 유형과 코멘트만 입력하면 됩니다." },
  view: { title: "오늘 보고가 제출되었습니다", sub: "검수 결과를 기다리는 중입니다. 현재는 읽기 전용입니다." },
  rejected: { title: "반려된 시간대를 다시 작성해 주세요", sub: "지목된 시간대만 수정할 수 있습니다." },
};
const TIME_OPTS = ["08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
const DUR_OPTS: Array<[string, number]> = [["30분",30],["1시간",60],["1시간 30분",90],["2시간",120],["2시간 30분",150],["3시간",180],["4시간",240]];

export default function ReportEditor({ view }: { view: ReportView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addKind, setAddKind] = useState<SectionKind | null>(null);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [start, setStart] = useState("");
  const [dur, setDur] = useState("");
  const [nightBranch, setNightBranch] = useState<"yes" | "no" | null>(view.nightHas ? "yes" : null);
  const [nightReason, setNightReason] = useState(view.nightReason ?? "");
  const [dailyComment, setDailyComment] = useState(view.dailyComment ?? "");
  const [vacationMode, setVacationMode] = useState(view.mode === "vacation");
  const [vacationType, setVacationType] = useState("연차");

  const mode = view.mode;
  const editable =
    mode === "rejected"
      ? new Set(view.sections.filter((s) => s.status === "재작성").map((s) => s.kind))
      : new Set(editableSections(mode, nightBranch));
  const stepper = stepperFor(mode);
  const primaryLabel = writePrimaryLabel(mode, nightBranch);
  const readOnly = mode === "view";

  async function call(url: string, body: unknown, method = "POST") {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "처리에 실패했습니다.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd(kind: SectionKind) {
    if (!title.trim()) {
      alert("업무명을 입력해 주세요.");
      return;
    }
    const durMin = DUR_OPTS.find(([l]) => l === dur)?.[1] ?? null;
    const ok = await call(`/api/reports/${view.reportId}/tasks`, {
      sectionKind: kind,
      title,
      project,
      plannedStart: start || null,
      plannedDurationMin: durMin,
    });
    if (ok) {
      setTitle("");
      setProject("");
      setStart("");
      setDur("");
      setAddKind(null);
      router.refresh();
    }
  }

  async function closeTask(taskId: number) {
    const ok = await call(`/api/tasks/${taskId}/close`, {});
    if (ok) router.refresh();
  }

  async function primary() {
    if (vacationMode) {
      const ok = await call(`/api/reports/${view.reportId}/advance`, {
        vacationType,
        dailyComment,
      });
      if (ok) router.refresh();
      return;
    }
    if (mode === "afternoonClose" && nightBranch === "yes" && !nightReason.trim()) {
      alert("야간 업무 사유를 입력해 주세요.");
      return;
    }
    const ok = await call(`/api/reports/${view.reportId}/advance`, {
      nightBranch,
      nightReason: nightReason || null,
      dailyComment,
    });
    if (ok) router.refresh();
  }

  return (
    <div data-report-id={view.reportId} data-report-mode={mode}>
      {/* 페이지 헤더 */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E5EB", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>일일 업무 보고서</span>
        <span style={{ fontSize: 14, color: "#3A4150", fontWeight: 600 }} className="tnum">{view.dateLabel}</span>
        <div style={{ flex: 1 }} />
        <span data-testid="report-status" style={{ fontSize: 12, fontWeight: 600, color: statusMeta(view.status).main, background: statusMeta(view.status).bg, border: `1px solid ${statusMeta(view.status).line}`, padding: "3px 10px", borderRadius: 6 }}>
          {view.status}
        </span>
      </div>

      <div style={{ maxWidth: 808, margin: "0 auto", padding: "24px 24px 120px" }}>
        {(mode === "view" || mode === "rejected") && (
          <div data-testid="mode-banner" style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 20, background: mode === "rejected" ? "#FCEBEB" : "#FBF4DA", border: `1px solid ${mode === "rejected" ? "#F5C2C2" : "#EFE0A6"}`, color: mode === "rejected" ? "#B91C1C" : "#8A6508", fontSize: 14, fontWeight: 600 }}>
            {mode === "rejected"
              ? `반려됨 — ${view.events.findLast((e) => e.kind === "rejected")?.comment ?? "재작성이 필요합니다."}`
              : "제출 완료 · 검수 대기 중입니다."}
          </div>
        )}

        {/* 스테퍼 */}
        <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "18px 22px", marginBottom: 20, overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", minWidth: 480 }}>
            {stepper.map((n) => {
              const m = statusMeta(n.state);
              const done = n.state === "완결";
              return (
                <div key={n.kind} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: n.current ? "#fff" : done ? "#1F9254" : m.bg, border: `2px solid ${n.current ? "#3B5BDB" : done ? "#1F9254" : m.line}`, color: done ? "#fff" : m.main, fontSize: 12, fontWeight: 700 }}>
                    {done ? "✓" : n.state === "지연" ? "!" : n.state === "반려" ? "↩" : n.state === "휴가" ? "/" : ""}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: n.current ? "#3B5BDB" : done ? "#1A1F2B" : "#6B7280", marginTop: 8 }}>{n.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 지금 할 일 */}
        {!vacationMode && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderLeft: "3px solid #3B5BDB", borderRadius: 12, padding: "16px 20px", marginBottom: 18 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3B5BDB", background: "#EEF2FF", padding: "3px 9px", borderRadius: 9999 }}>지금 할 일</span>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: "26px", marginTop: 8 }}>{HEADER[mode].title}</div>
            <div style={{ fontSize: 14, color: "#6B7280", marginTop: 3 }}>{HEADER[mode].sub}</div>

            {(mode === "morningClose" || mode === "afternoonClose" || mode === "morningPlan") && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #EFF1F5", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>오늘 휴가인가요?</span>
                <button onClick={() => setVacationMode(true)} data-testid="go-vacation" style={btnGhost}>휴가로 전환</button>
              </div>
            )}

            {mode === "afternoonClose" && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #EFF1F5" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>야간 업무가 있나요?</span>
                  <div style={{ display: "inline-flex", background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 9999, padding: 3 }}>
                    <button onClick={() => setNightBranch("no")} style={pill(nightBranch === "no")}>없음</button>
                    <button onClick={() => setNightBranch("yes")} data-testid="night-yes" style={pill(nightBranch === "yes")}>있음</button>
                  </div>
                </div>
                {nightBranch === "yes" && (
                  <textarea value={nightReason} onChange={(e) => setNightReason(e.target.value)} placeholder="예) PG사 정기 점검 대응으로 21:30까지 야간 대기가 필요합니다." style={{ width: "100%", minHeight: 64, marginTop: 12, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14 }} />
                )}
              </div>
            )}
          </div>
        )}

        {/* 휴가 모드 */}
        {vacationMode && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: 22, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>오늘은 휴가로 처리할까요?</div>
              {mode !== "vacation" && <button onClick={() => setVacationMode(false)} style={btnGhost}>← 업무 작성으로</button>}
            </div>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 7 }}>휴가 유형</label>
            <select value={vacationType} onChange={(e) => setVacationType(e.target.value)} style={{ maxWidth: 240, width: "100%", height: 44, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14 }}>
              {["연차", "반차", "병가", "공가", "기타"].map((v) => <option key={v}>{v}</option>)}
            </select>
          </div>
        )}

        {/* 시간대 섹션 */}
        {!vacationMode &&
          view.sections.map((sec) => {
            const isEditable = editable.has(sec.kind) && !readOnly;
            return (
              <div key={sec.id} data-testid={`section-${sec.kind}`} style={{ background: "#fff", border: `1px solid ${isEditable ? "#3B5BDB" : "#E2E5EB"}`, borderLeft: `${isEditable ? 3 : 1}px solid ${isEditable ? "#3B5BDB" : "#E2E5EB"}`, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: isEditable ? "#fff" : "#FAFBFC", flexWrap: "wrap" }}>
                  {sec.locked && <span style={{ color: "#9AA1AE" }}>🔒</span>}
                  <span style={{ fontSize: 15, fontWeight: 600, color: sec.locked ? "#6B7280" : "#1A1F2B" }}>{SECTION_NAME[sec.kind]}</span>
                  <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{SECTION_RANGE[sec.kind]}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: statusMeta(sec.status).bg, border: `1px solid ${statusMeta(sec.status).line}`, color: statusMeta(sec.status).main }}>{sec.status}</span>
                </div>
                <div style={{ padding: "8px 18px 18px" }}>
                  {sec.tasks.length === 0 && <div style={{ fontSize: 13, color: "#9AA1AE", padding: "8px 0" }}>아직 등록된 업무가 없습니다.</div>}
                  {sec.tasks.map((t) => {
                    const m = statusMeta(t.status);
                    const done = t.status === "완결";
                    return (
                      <div key={t.id} data-testid="task-row" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid #F2F3F6" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 9999, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#1F9254" : "#fff", border: `1.5px solid ${done ? "#1F9254" : t.status === "지연" ? "#F5C2C2" : "#CBD0D9"}`, color: done ? "#fff" : m.main, fontSize: 11, fontWeight: 700, flex: "none" }}>
                          {done ? "✓" : t.status === "지연" ? "!" : ""}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status}</span>
                          </div>
                          {(t.planned_duration_min || t.actual_duration_min) && (
                            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }} className="tnum">
                              {t.planned_duration_min ? `계획 ${t.planned_duration_min}분` : ""}
                              {t.actual_duration_min ? ` / 실제 ${t.actual_duration_min}분` : ""}
                            </div>
                          )}
                          {t.hold_reason && <div style={{ fontSize: 12, color: "#B45309", marginTop: 6 }}>지연 사유 · {t.hold_reason}</div>}
                        </div>
                        {isEditable && !done && (
                          <button onClick={() => closeTask(t.id)} disabled={busy} data-testid={`close-task-${t.id}`} style={{ flex: "none", background: "#fff", border: "1px solid #BBE5C8", color: "#1F9254", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "5px 11px" }}>마감</button>
                        )}
                      </div>
                    );
                  })}

                  {isEditable && (
                    addKind === sec.kind ? (
                      <div style={{ border: "1px solid #CBD0D9", borderRadius: 10, background: "#FBFCFD", padding: 14, marginTop: 10 }}>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="업무명을 입력해 주세요" data-testid="add-title" style={inp} />
                        <input value={project} onChange={(e) => setProject(e.target.value)} placeholder="프로젝트명 (선택)" style={{ ...inp, marginTop: 8 }} />
                        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                          <select value={start} onChange={(e) => setStart(e.target.value)} style={{ ...inp, flex: 1 }}>
                            <option value="">시작 시각</option>
                            {TIME_OPTS.map((t) => <option key={t}>{t}</option>)}
                          </select>
                          <select value={dur} onChange={(e) => setDur(e.target.value)} style={{ ...inp, flex: 1 }}>
                            <option value="">소요 시간</option>
                            {DUR_OPTS.map(([l]) => <option key={l}>{l}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                          <button onClick={() => setAddKind(null)} style={btnGhost}>취소</button>
                          <button onClick={() => submitAdd(sec.kind)} disabled={busy} data-testid="add-submit" style={btnPrimary}>추가</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddKind(sec.kind)} data-testid={`add-task-${sec.kind}`} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #CBD0D9", borderRadius: 8, padding: "9px 12px", width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#3B5BDB", marginTop: 10 }}>＋ 업무 추가</button>
                    )
                  )}
                </div>
              </div>
            );
          })}

        {/* 일일 코멘트 */}
        {(mode === "afternoonClose" || mode === "nightClose") && !vacationMode && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>일일 코멘트</div>
            <textarea value={dailyComment} onChange={(e) => setDailyComment(e.target.value)} data-testid="daily-comment" placeholder="오늘 업무에 대한 한 줄 정리나 내일 우선순위를 적어주세요." style={{ width: "100%", minHeight: 88, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14 }} />
          </div>
        )}

        {/* 커뮤니케이션 (읽기) */}
        {view.comms.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>커뮤니케이션 기록</div>
            {view.comms.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #F2F3F6" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 9999, padding: "3px 9px", flex: "none" }}>{c.type}</span>
                <div><div style={{ fontSize: 13 }}><strong>{c.counterpart}</strong> · <span className="tnum" style={{ color: "#6B7280" }}>{c.time}</span></div><div style={{ fontSize: 13, color: "#3A4150" }}>{c.summary}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 액션바 */}
      {!readOnly && (
        <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.94)", borderTop: "1px solid #E2E5EB", padding: "12px 24px", display: "flex", gap: 12 }}>
          <div style={{ maxWidth: 808, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }} />
            <button onClick={primary} disabled={busy} data-testid="primary-action" style={{ height: 44, padding: "0 22px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>
              {vacationMode ? "휴가로 제출" : primaryLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none", background: "#fff" };
const btnGhost: React.CSSProperties = { border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { border: "none", background: "#3B5BDB", color: "#fff", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer" };
function pill(active: boolean): React.CSSProperties {
  return { border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "6px 16px", borderRadius: 9999, background: active ? "#3B5BDB" : "transparent", color: active ? "#fff" : "#3A4150" };
}
