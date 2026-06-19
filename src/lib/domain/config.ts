// #4 모델 컷오버 + 기능 플래그 해석. (env.model 단일 소스)
//  - 컷오버 미설정(기본) → 모든 신규 보고서 v2(단일목록).
//  - 보고서가 만들어질 때 model_version이 확정되고, 이후 렌더는 model_version(=SoT)으로 판정.
import { env } from "../env";

const CUTOVER_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' KST. 형식 불량/미설정이면 null(=컷오버 없음 → 전부 v2) */
export const MODEL_CUTOVER: string | null = CUTOVER_RE.test(env.model.cutover)
  ? env.model.cutover
  : null;

/** v2(버킷/2단계) 모델 전역 활성 여부. off면 전부 레거시(단계 배포 1차). */
export const BUCKET_MODE_ON: boolean = env.model.bucketMode !== "off";

/**
 * 신규 보고서를 v2로 만들지 — getOrCreateReport 가 생성 시점에 1회 평가.
 * 컷오버 미설정이면 항상 v2. 설정 시 report_date >= 컷오버부터 v2.
 */
export function isV2Date(reportDate: string): boolean {
  if (!BUCKET_MODE_ON) return false;
  if (!MODEL_CUTOVER) return true;
  return reportDate >= MODEL_CUTOVER;
}

/** 렌더/검수 분기용: 보고서 행이 v2(단일목록)인지 — model_version=2면 v2 */
export function isV2Report(r: { model_version?: number | null }): boolean {
  return (r.model_version ?? 1) >= 2;
}
