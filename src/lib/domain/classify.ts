// #4 완료시각 자동분류. 디자인 classifyTasks() 계승.
//  - is_night 플래그 task → 야간 버킷(야간 토글 on 일 때만 표시), 완료 여부 무관 (C1: is_night 우선)
//  - 그 외: 완결/지연 + completed_at 있으면 KST 시 <12 → 오전 / ≥12 → 오후
//  - 미완료(계획/진행중) → todo(오늘 할 일)
// KST는 DST 없는 UTC+9 고정.

export type Bucket = "todo" | "am" | "pm" | "night";

export interface ClassifiableTask {
  status: string; // 계획 | 진행중 | 완결 | 지연
  completed_at: Date | string | null;
  created_at?: Date | string | null; // 동률(같은 분 마감) 타이브레이크용 등록 시각
  is_night: boolean;
}

/** timestamptz → KST(UTC+9) 시(0-23) */
export function kstHour(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  return (date.getUTCHours() + 9) % 24;
}

function completedMs(t: ClassifiableTask): number {
  if (t.completed_at == null) return 0;
  const d = typeof t.completed_at === "string" ? new Date(t.completed_at) : t.completed_at;
  return d.getTime();
}

function createdMs(t: ClassifiableTask): number {
  if (t.created_at == null) return 0;
  const d = typeof t.created_at === "string" ? new Date(t.created_at) : t.created_at;
  return d.getTime();
}

/**
 * 오전/오후 버킷 정렬: 실제 마감시각(분 단위) 오름차순, 같은 분이면 등록(생성) 시각 오름차순.
 * 분 단위로 묶는 이유: 표시값이 HH:MM이라 '같은 시각'의 직관 = 같은 분. 초/ms 차이로 순서가
 * 흔들리지 않게 분으로 1차 비교하고, 동률만 등록순으로 안정 정렬.
 */
export function byCompletedThenCreated(a: ClassifiableTask, b: ClassifiableTask): number {
  return (
    Math.floor(completedMs(a) / 60000) - Math.floor(completedMs(b) / 60000) ||
    createdMs(a) - createdMs(b)
  );
}

/**
 * 단일 task의 버킷 판정. is_night인데 nightOn=false면 null(표시 안 함).
 */
export function classifyTask(t: ClassifiableTask, nightOn: boolean): Bucket | null {
  if (t.is_night) return nightOn ? "night" : null;
  const done = (t.status === "완결" || t.status === "지연") && t.completed_at != null;
  if (!done) return "todo";
  const h = kstHour(t.completed_at as Date | string);
  if (Number.isNaN(h)) return "todo"; // 파싱 불가한 completed_at은 오후로 오분류하지 않고 할 일로
  return h < 12 ? "am" : "pm";
}

export interface Buckets<T> {
  todo: T[];
  am: T[];
  pm: T[];
  night: T[];
}

/** 업무 목록을 버킷별로 분류 + 정렬(오전/오후=완료시각 오름차순, todo=진행중 우선) */
export function bucketTasks<T extends ClassifiableTask>(tasks: T[], nightOn: boolean): Buckets<T> {
  const todo: T[] = [];
  const am: T[] = [];
  const pm: T[] = [];
  const night: T[] = [];
  for (const t of tasks) {
    switch (classifyTask(t, nightOn)) {
      case "night":
        night.push(t);
        break;
      case "am":
        am.push(t);
        break;
      case "pm":
        pm.push(t);
        break;
      case "todo":
        todo.push(t);
        break;
      // null → 숨김
    }
  }
  am.sort(byCompletedThenCreated);
  pm.sort(byCompletedThenCreated);
  // '오늘 할 일'은 자동 정렬하지 않음 — 입력 배열 순서(= 쿼리 sort_order, id) = 사용자 지정 순서(드래그 재정렬)
  return { todo, am, pm, night };
}
