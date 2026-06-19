// v1 레거시(섹션 순차 모델) 도메인 로직 격리.
// 컷오버 이전 보고서(model_version=1)의 동결 렌더 전용 — v2 라벨/스테퍼와 절대 혼용 금지.
// (검증 B4) v1 라벨에 '계획제출' 분기가 없어, 공통 함수로 묶으면 v1에서 라벨 오류 → 분리 보존.
import type { LegacyWriteMode, ReportStatus, SectionKind } from "./status";
import type { StepperNode } from "./report";

export type SectionStatusMap = Partial<Record<SectionKind, string>>;

/** [v1] 보고서 상태 + 섹션 마감 여부로 순차 작성 모드 결정 */
export function legacyWriteMode(
  status: ReportStatus,
  isVacation: boolean,
  sec: SectionStatusMap,
): LegacyWriteMode {
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

/** [v1] 모드에서 '최종 제출'이 일어나는지 */
export function legacyIsSubmitMode(
  mode: LegacyWriteMode,
  nightBranch: "yes" | "no" | null,
): boolean {
  if (mode === "afternoonClose") return nightBranch !== "yes";
  if (mode === "nightClose") return true;
  if (mode === "rejected") return true;
  if (mode === "vacation") return true;
  return false;
}

const ORDER: SectionKind[] = ["plan", "morning", "afternoon", "night"];
const LABEL: Record<SectionKind, string> = {
  plan: "계획",
  morning: "오전",
  afternoon: "오후",
  night: "야간",
};

/** [v1] writeMode → 4단계 섹션 스테퍼 상태 */
export function legacyStepperFor(mode: LegacyWriteMode): StepperNode[] {
  let map: Record<SectionKind, string> = {
    plan: "계획",
    morning: "미작성",
    afternoon: "미작성",
    night: "미작성",
  };
  let current: SectionKind | null = "plan";

  if (mode === "morningPlan") current = "plan";
  else if (mode === "morningClose") {
    map.plan = "완결";
    current = "morning";
  } else if (mode === "afternoonClose") {
    map.plan = "완결";
    map.morning = "완결";
    current = "afternoon";
  } else if (mode === "nightClose") {
    map.plan = "완결";
    map.morning = "완결";
    map.afternoon = "완결";
    current = "night";
  } else if (mode === "view") {
    map.plan = "완결";
    map.morning = "완결";
    map.afternoon = "완결";
    current = null;
  } else if (mode === "rejected") {
    map.plan = "완결";
    map.morning = "완결";
    map.afternoon = "반려";
    current = "afternoon";
  } else if (mode === "vacation") {
    map = { plan: "휴가", morning: "휴가", afternoon: "휴가", night: "휴가" };
    current = null;
  }

  return ORDER.map((kind) => ({
    kind,
    label: LABEL[kind],
    state: map[kind],
    current: kind === current,
  }));
}

/** [v1] 제출/마감 1차 버튼 라벨 */
export function legacyWritePrimaryLabel(
  mode: LegacyWriteMode,
  nightBranch: "yes" | "no" | null,
): string {
  switch (mode) {
    case "vacation":
      return "휴가로 제출";
    case "morningPlan":
      return "계획 제출";
    case "morningClose":
      return "오전 마감하기";
    case "afternoonClose":
      return nightBranch === "yes" ? "야간 계획 저장" : "최종 제출";
    case "nightClose":
      return "최종 제출";
    case "view":
      return "제출 완료";
    case "rejected":
      return "재제출하기";
    default:
      return "제출";
  }
}

/** [v1] 모드별 편집 가능한 시간대 */
export function legacyEditableSections(
  mode: LegacyWriteMode,
  nightBranch: "yes" | "no" | null,
): SectionKind[] {
  switch (mode) {
    case "morningPlan":
      return ["plan"];
    case "morningClose":
      return ["morning", "afternoon"];
    case "afternoonClose":
      return ["afternoon"];
    case "nightClose":
      return nightBranch === "yes" ? ["night"] : [];
    case "rejected":
      return ["afternoon"];
    case "view":
    case "vacation":
    default:
      return [];
  }
}
