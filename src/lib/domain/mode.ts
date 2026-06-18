import type { ReportStatus, SectionKind, WriteMode } from "./status";

export type SectionStatusMap = Partial<Record<SectionKind, string>>;

/**
 * 보고서 상태 + 시간대 마감 여부로 작성 모드를 결정 (상태 기반, 벽시계 비의존).
 * - 메일 스케줄(시각 기반)은 별도. 앱 내 진행은 plan→morning→afternoon→night 순차 마감.
 */
export function computeWriteMode(
  status: ReportStatus,
  isVacation: boolean,
  sec: SectionStatusMap,
): WriteMode {
  if (status === "반려") return "rejected";
  if (status === "검수대기" || status === "제출완료" || status === "승인" || status === "재제출")
    return "view";
  if (isVacation) return "vacation";

  const closed = (k: SectionKind) => sec[k] === "마감완료";
  if (!closed("plan")) return "morningPlan";
  if (!closed("morning")) return "morningClose";
  if (!closed("afternoon")) return "afternoonClose";
  return "nightClose";
}

/** 모드에서 '최종 제출'이 일어나는지 (제출 버튼이 검수대기로 보내는지) */
export function isSubmitMode(mode: WriteMode, nightBranch: "yes" | "no" | null): boolean {
  if (mode === "afternoonClose") return nightBranch !== "yes";
  if (mode === "nightClose") return true;
  if (mode === "rejected") return true;
  if (mode === "vacation") return true;
  return false;
}
