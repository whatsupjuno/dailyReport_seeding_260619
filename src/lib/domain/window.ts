// 그룹 시간정책(GroupWindow). is_ai_group 하나가 마스터 스위치 —
// 날짜경계(09:00 vs 자정)·요일(매일 vs 평일)·24시간 표기를 전부 여기서 '파생'한다(별도 컬럼 없음 → drift 방지).
import { reportDateForBoundary } from "../date";

export interface GroupWindow {
  isAi: boolean;
  writeStart: string; // 'HH:MM:SS' (KST)
  writeEnd: string; // 'HH:MM:SS'
  submitDue: string | null; // 'HH:MM:SS' 자동제출 시각, null = OFF
}

/** AI 그룹 = 09:00 보고일 경계. 비-AI = 자정(0시). */
export const boundaryHour = (w: GroupWindow): number => (w.isAi ? 9 : 0);
/** 비-AI 그룹만 평일 한정(자동 알림/자동제출). AI는 매일. */
export const weekdayOnly = (w: GroupWindow): boolean => !w.isAi;
/** AI 그룹만 오전/오후/야간 없이 24시간 단일 타임라인 표기. */
export const use24h = (w: GroupWindow): boolean => w.isAi;

/** 정책 미스냅샷(0018 이전 보고서)·그룹 없는 사용자 폴백: 비-AI·자정·자동제출 OFF. */
export const DEFAULT_WINDOW: GroupWindow = {
  isAi: false,
  writeStart: "00:00:00",
  writeEnd: "23:59:00",
  submitDue: null,
};

/** 윈도우 기준 '현재 보고일'(KST). AI는 09:00 이전을 전날(윈도우 시작일)로 귀속. */
export const reportDateFor = (w: GroupWindow, now: Date): string =>
  reportDateForBoundary(boundaryHour(w), now);
