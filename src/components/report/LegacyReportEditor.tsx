// v1 레거시(섹션 순차 모델) 동결 렌더. 컷오버 이전 보고서를 읽기 전용으로 표시.
// 편집 불가 — 새 작성은 모두 v2(ReportEditor)로 수렴.
import { statusMeta, type SectionKind } from "@/lib/domain/status";
import type { FullReport } from "@/lib/data/reports";
import { kstHm } from "@/lib/date";

const SECTION_NAME: Record<SectionKind, string> = {
  plan: "오늘 계획",
  morning: "오전",
  afternoon: "오후",
  night: "야간",
};

interface LegacyTask {
  id: number;
  project: string | null;
  title: string;
  status: string;
  holdReason: string | null;
  doneTime: string | null;
}
interface LegacySection {
  id: number;
  kind: SectionKind;
  status: string;
  locked: boolean;
  tasks: LegacyTask[];
}
export interface LegacyView {
  reportId: number;
  date: string;
  dateLabel: string;
  status: string;
  isVacation: boolean;
  vacationType: string | null;
  vacationComment: string | null;
  dailyComment: string | null;
  sections: LegacySection[];
  comms: Array<{ id: number; type: string; counterpart: string; time: string | null; summary: string }>;
}

export function buildLegacyView(full: FullReport, date: string): LegacyView {
  const [y, m, d] = date.split("-").map(Number);
  const dow = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return {
    reportId: full.report.id,
    date,
    dateLabel: `${y}년 ${m}월 ${d}일 (${dow})`,
    status: full.report.status,
    isVacation: full.report.is_vacation,
    vacationType: full.report.vacation_type,
    vacationComment: full.report.vacation_comment,
    dailyComment: full.report.daily_comment,
    sections: full.sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      status: s.status,
      locked: s.locked,
      tasks: full.tasks
        .filter((t) => t.section_id === s.id)
        .map((t) => ({
          id: t.id,
          project: t.project,
          title: t.title,
          status: t.status,
          holdReason: t.hold_reason,
          doneTime: kstHm(t.completed_at),
        })),
    })),
    comms: full.comms.map((c) => ({
      id: c.id,
      type: c.comm_type,
      counterpart: c.counterpart,
      time: c.occurred_at,
      summary: c.summary,
    })),
  };
}

export default function LegacyReportEditor({ view }: { view: LegacyView }) {
  const sm = statusMeta(view.status);
  return (
    <div data-report-id={view.reportId} data-report-mode="legacy">
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E5EB", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>일일 업무 보고서</span>
        <span style={{ fontSize: 14, color: "#3A4150", fontWeight: 600 }} className="tnum">{view.dateLabel}</span>
        <div style={{ flex: 1 }} />
        <span data-testid="report-status" style={{ fontSize: 12, fontWeight: 600, color: sm.main, background: sm.bg, border: `1px solid ${sm.line}`, padding: "3px 10px", borderRadius: 6 }}>{view.status}</span>
      </div>

      <div style={{ maxWidth: 808, margin: "0 auto", padding: "24px 24px 80px" }}>
        <div data-testid="legacy-banner" style={{ borderRadius: 10, padding: "12px 14px", marginBottom: 20, background: "#F1F2F4", border: "1px solid #D9DCE2", color: "#3A4150", fontSize: 13, fontWeight: 600 }}>
          이 보고서는 이전(섹션) 형식으로 작성되어 읽기 전용으로 표시됩니다.
        </div>

        {view.isVacation ? (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: 22, marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>휴가 — {view.vacationType ?? ""}</div>
            {view.vacationComment && (
              <div style={{ fontSize: 13, color: "#3A4150", marginTop: 8, whiteSpace: "pre-wrap" }}>{view.vacationComment}</div>
            )}
          </div>
        ) : (
          view.sections.map((sec) => (
            <div key={sec.id} data-testid={`section-${sec.kind}`} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC", flexWrap: "wrap" }}>
                {sec.locked && <span style={{ color: "#9AA1AE" }}>🔒</span>}
                <span style={{ fontSize: 15, fontWeight: 600 }}>{SECTION_NAME[sec.kind]}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: statusMeta(sec.status).bg, border: `1px solid ${statusMeta(sec.status).line}`, color: statusMeta(sec.status).main }}>{sec.status}</span>
              </div>
              <div style={{ padding: "8px 18px 16px" }}>
                {sec.tasks.length === 0 && <div style={{ fontSize: 13, color: "#9AA1AE", padding: "8px 0" }}>등록된 업무가 없습니다.</div>}
                {sec.tasks.map((t) => {
                  const tm = statusMeta(t.status);
                  return (
                    <div key={t.id} data-testid="task-row" style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid #F2F3F6" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: tm.bg, border: `1px solid ${tm.line}`, color: tm.main }}>{t.status}</span>
                          {t.doneTime && <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "#F1F2F4", borderRadius: 6, padding: "2px 7px" }} className="tnum">✓ 마감 {t.doneTime}</span>}
                        </div>
                        {t.holdReason && <div style={{ fontSize: 12, color: "#B45309", marginTop: 6 }}>지연 사유 · {t.holdReason}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {view.comms.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>커뮤니케이션 기록</div>
            {view.comms.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #F2F3F6" }}>
                <span className="badge badge-comm" style={{ flex: "none" }}>{c.type}</span>
                <div><div style={{ fontSize: 13 }}><strong>{c.counterpart}</strong>{c.time ? <> · <span className="tnum" style={{ color: "#6B7280" }}>{c.time}</span></> : null}</div><div style={{ fontSize: 13, color: "#3A4150" }}>{c.summary}</div></div>
              </div>
            ))}
          </div>
        )}

        {view.dailyComment && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>일일 코멘트</div>
            <div style={{ fontSize: 13, color: "#3A4150", whiteSpace: "pre-wrap" }}>{view.dailyComment}</div>
          </div>
        )}
      </div>
    </div>
  );
}
