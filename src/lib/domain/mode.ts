import type { ReportStatus, WriteMode } from "./status";

/**
 * v2 단일목록 모델의 작성 모드 결정 (status + 휴가 플래그만, 섹션·벽시계 비의존).
 * - work: 미작성/작성중/계획제출 — 오늘 할 일 편집·마감·추가 가능(계획제출도 편집 자유, D3).
 * - review: 검수대기 — 승인 전까지 작성자 편집 가능(재제출/재알림 없음, 제출 버튼 숨김).
 * - view: 승인/제출완료/재제출 — 읽기 전용(최종 잠금).
 * - rejected: 반려 — 미해소 반려 행만 편집.
 * - vacation: 휴가/휴직 작성.
 * 우선순위: 반려 > 검수대기(review/vacation) > 최종잠금(view) > 휴가 > work. (반려가 휴가보다 우선 — 레거시 계승)
 */
export function computeWriteMode(status: ReportStatus, isVacation: boolean): WriteMode {
  if (status === "반려") return "rejected";
  if (status === "검수대기") return isVacation ? "vacation" : "review"; // 승인 전까지 편집 가능
  if (status === "제출완료" || status === "승인" || status === "재제출") return "view"; // 최종 잠금
  if (isVacation) return "vacation";
  return "work"; // 미작성 | 작성중 | 계획제출
}
