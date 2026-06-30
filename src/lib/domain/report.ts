import { computeWriteMode } from "./mode";
import type { ReportStatus, SectionKind, TaskStatus } from "./status";

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

/** [v1 레거시] 4단계 섹션 스테퍼 노드 — legacyStepperFor 가 반환 */
export interface StepperNode {
  kind: SectionKind;
  label: string;
  /** 완결 | 미작성 | 계획 | 반려 | 휴가 등 */
  state: string;
  current: boolean;
}

/** [v2] 2노드 스테퍼(작성 → 제출). 디자인 stepper2() 로직 계승 — 색은 컴포넌트가 부여 */
export interface Stepper2Node {
  label: "작성" | "제출";
  sub: string;
  /** 제출 완료(검수대기 이후) 상태 */
  done: boolean;
  current: boolean;
}

export function stepper2(opts: {
  submitted: boolean;
  todoCount: number;
  doneCount: number;
}): Stepper2Node[] {
  const { submitted, todoCount, doneCount } = opts;
  return [
    {
      label: "작성",
      sub: `할 일 ${todoCount} · 완료 ${doneCount}`,
      done: submitted,
      current: !submitted,
    },
    {
      label: "제출",
      sub: submitted ? "제출 완료" : "미제출",
      done: submitted,
      current: submitted,
    },
  ];
}

/**
 * [v2] 제출 1차 버튼 라벨. 2단계(C2):
 * - 미작성/작성중 → '계획 제출'(1차)  · 계획제출 → '제출하기'(최종)
 * - 반려 → '다시 제출'  · view → '제출 완료'
 * (휴가 모드 라벨은 vacType 의존 → 컴포넌트에서 vacSubmitLabel 로 별도 처리)
 */
export function writePrimaryLabel(status: ReportStatus): string {
  const mode = computeWriteMode(status, false);
  if (status === "검수대기") return ""; // 검수대기: 제출 버튼 미노출
  if (mode === "view") return "제출 완료";
  if (mode === "rejected") return "다시 제출";
  if (status === "계획제출") return "제출하기";
  return "계획 제출";
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
