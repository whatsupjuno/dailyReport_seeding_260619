import type { SectionKind, TaskStatus, WriteMode } from "./status";

export interface TaskLike {
  status: TaskStatus | "완결" | "지연" | "진행중" | "계획";
}

export interface Completion {
  total: number;
  done: number; // 완결
  delayed: number; // 지연
  inProgress: number; // 진행중
  planned: number; // 계획
  /** 완결율 % (정수, total 0이면 0) */
  pct: number;
}

/** 업무 목록으로 완결/지연/완결율 계산 (디자인 목록의 완결율·지연 표기 근거) */
export function computeCompletion(tasks: TaskLike[]): Completion {
  const total = tasks.length;
  let done = 0;
  let delayed = 0;
  let inProgress = 0;
  let planned = 0;
  for (const t of tasks) {
    switch (t.status) {
      case "완결":
        done++;
        break;
      case "지연":
        delayed++;
        break;
      case "진행중":
        inProgress++;
        break;
      default:
        planned++;
    }
  }
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, delayed, inProgress, planned, pct };
}

export interface StepperNode {
  kind: SectionKind;
  label: string;
  /** 완결 | 미작성 | 계획 | 반려 | 휴가 등 */
  state: string;
  current: boolean;
}

const ORDER: SectionKind[] = ["plan", "morning", "afternoon", "night"];
const LABEL: Record<SectionKind, string> = {
  plan: "계획",
  morning: "오전",
  afternoon: "오후",
  night: "야간",
};

/** writeMode → 4단계 스테퍼 상태 (디자인 stepperNodes 로직 계승) */
export function stepperFor(mode: WriteMode): StepperNode[] {
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

/** 제출/마감 1차 버튼 라벨 (디자인 writePrimary) */
export function writePrimaryLabel(mode: WriteMode, nightBranch: "yes" | "no" | null): string {
  switch (mode) {
    case "vacation":
      return "휴가로 제출";
    case "morningPlan":
      return "계획 제출";
    case "morningClose":
      return "오전 마감하기";
    case "afternoonClose":
      return "최종 제출";
    case "nightClose":
      return nightBranch === "yes" ? "야간 계획 저장" : "최종 제출";
    case "view":
      return "제출 완료";
    case "rejected":
      return "재제출하기";
    default:
      return "제출";
  }
}

/** 모드별 편집 가능한 시간대 (디자인 buildSections의 editable 섹션) */
export function editableSections(mode: WriteMode, nightBranch: "yes" | "no" | null): SectionKind[] {
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
      return ["afternoon"]; // 반려 지목 시간대(예시: 오후)
    case "view":
    case "vacation":
    default:
      return [];
  }
}

/** 정상/지연/지연임박 판정 (마감 시각 대비 현재) */
export function delayState(
  hasUnfinished: boolean,
  now: Date,
  deadline: Date,
  soonMinutes = 30,
): "정상" | "지연임박" | "지연" {
  if (now.getTime() > deadline.getTime() && hasUnfinished) return "지연";
  if (deadline.getTime() - now.getTime() <= soonMinutes * 60_000 && hasUnfinished) return "지연임박";
  return "정상";
}
