// 디자인 아티팩트의 SM(상태 메타)을 코드 단일 진실원천으로 계승.

export type TaskStatus = "계획" | "진행중" | "완결" | "지연";
export type DerivedTaskStatus = TaskStatus | "지연임박";

export type ReportStatus =
  | "미작성"
  | "작성중"
  | "계획제출" // C2: 2단계 제출(아침 계획 제출 후 마감 전). v2 전용 — 레거시 미사용.
  | "제출완료"
  | "재제출"
  | "검수대기"
  | "반려"
  | "승인"
  | "휴가";

export type SectionKind = "plan" | "morning" | "afternoon" | "night";

// v2 작성 모드(단일목록 모델). status + 휴가 플래그만으로 결정 — 섹션 비의존.
export type WriteMode = "work" | "view" | "rejected" | "vacation";

/** 제출본 읽기 전용 잠금 상태. */
export const FINAL_LOCKED: ReportStatus[] = ["검수대기", "승인", "제출완료", "재제출"];

// v1 레거시(섹션 순차 모델) 작성 모드. legacy.ts 전용.
export type LegacyWriteMode =
  | "morningPlan"
  | "morningClose"
  | "afternoonClose"
  | "nightClose"
  | "vacation"
  | "view"
  | "rejected";

export type ReviewAction = "approve" | "reject";
export type RejectTarget = "전체" | "오전" | "오후" | "야간";
export type VacationType = "연차" | "반차" | "병가" | "공가" | "휴직" | "기타";
export type CommType = "통화" | "메일" | "회의" | "카톡" | "구두" | "메신저";
export type UserRole = "employee" | "group_leader" | "admin";

export interface StatusMeta {
  main: string;
  bg: string;
  line: string;
  icon: string;
}

// 디자인 script의 SM 객체와 1:1
export const STATUS_META: Record<string, StatusMeta> = {
  완결: { main: "#1F9254", bg: "#E7F6EC", line: "#BBE5C8", icon: "✓" },
  진행중: { main: "#2563EB", bg: "#E6EEFD", line: "#BBD0F7", icon: "◔" },
  지연: { main: "#DC2626", bg: "#FCEBEB", line: "#F5C2C2", icon: "!" },
  지연임박: { main: "#D97706", bg: "#FDF3E5", line: "#F6D9A8", icon: "◷" },
  검수대기: { main: "#B7860B", bg: "#FBF4DA", line: "#EFE0A6", icon: "⧗" },
  반려: { main: "#DC2626", bg: "#FCEBEB", line: "#F5C2C2", icon: "↩" },
  승인: { main: "#1F9254", bg: "#E7F6EC", line: "#BBE5C8", icon: "✓" },
  휴가: { main: "#6B7280", bg: "#F1F2F4", line: "#D9DCE2", icon: "/" },
  미작성: { main: "#6B7280", bg: "#F7F8FA", line: "#E2E5EB", icon: "·" },
  계획: { main: "#6B7280", bg: "#F7F8FA", line: "#E2E5EB", icon: "·" },
  작성중: { main: "#2563EB", bg: "#E6EEFD", line: "#BBD0F7", icon: "◔" },
  계획제출: { main: "#2563EB", bg: "#E6EEFD", line: "#BBD0F7", icon: "▸" },
  제출완료: { main: "#2563EB", bg: "#E6EEFD", line: "#BBD0F7", icon: "◔" },
  재제출: { main: "#2563EB", bg: "#E6EEFD", line: "#BBD0F7", icon: "↻" },
  마감완료: { main: "#1F9254", bg: "#E7F6EC", line: "#BBE5C8", icon: "✓" },
  재작성: { main: "#DC2626", bg: "#FCEBEB", line: "#F5C2C2", icon: "↩" },
  면제: { main: "#6B7280", bg: "#F1F2F4", line: "#D9DCE2", icon: "–" },
};

export function statusMeta(label: string): StatusMeta {
  return STATUS_META[label] ?? STATUS_META["미작성"];
}

export const SECTION_LABEL: Record<SectionKind, string> = {
  plan: "계획",
  morning: "오전",
  afternoon: "오후",
  night: "야간",
};

export const SECTION_RANGE: Record<SectionKind, string> = {
  plan: "08:30 ~ 11:50",
  morning: "08:30 ~ 11:50",
  afternoon: "11:50 ~ 17:50",
  night: "17:50 ~ 21:30",
};
