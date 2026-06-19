import { describe, expect, it } from "vitest";
import { computeWriteMode } from "@/lib/domain/mode";
import { legacyWriteMode, legacyIsSubmitMode } from "@/lib/domain/legacy";

// v2 단일목록 모델: 2인자 4모드 (status, isVacation)
describe("computeWriteMode (v2, 2인자 4모드)", () => {
  it("미작성/작성중/계획제출 → work", () => {
    expect(computeWriteMode("미작성", false)).toBe("work");
    expect(computeWriteMode("작성중", false)).toBe("work");
    expect(computeWriteMode("계획제출", false)).toBe("work"); // 계획제출도 편집 자유(D3)
  });
  it("검수대기/승인/제출완료/재제출 → view", () => {
    expect(computeWriteMode("검수대기", false)).toBe("view");
    expect(computeWriteMode("승인", false)).toBe("view");
    expect(computeWriteMode("제출완료", false)).toBe("view");
    expect(computeWriteMode("재제출", false)).toBe("view");
  });
  it("반려 → rejected", () => {
    expect(computeWriteMode("반려", false)).toBe("rejected");
  });
  it("휴가 플래그 → vacation", () => {
    expect(computeWriteMode("작성중", true)).toBe("vacation");
  });
  it("반려가 휴가보다 우선", () => {
    expect(computeWriteMode("반려", true)).toBe("rejected");
  });
  it("제출이후(view)가 휴가보다 우선", () => {
    expect(computeWriteMode("검수대기", true)).toBe("view");
  });
});

// v1 레거시 섹션 순차 모델 회귀 (LegacyReportEditor 동결 렌더용)
describe("legacyWriteMode (v1, 3인자 7모드)", () => {
  it("초기(plan 미마감) → morningPlan", () => {
    expect(legacyWriteMode("작성중", false, { plan: "작성중" })).toBe("morningPlan");
  });
  it("plan 마감 → morningClose", () => {
    expect(legacyWriteMode("작성중", false, { plan: "마감완료", morning: "작성중" })).toBe("morningClose");
  });
  it("morning 마감 → afternoonClose", () => {
    expect(
      legacyWriteMode("작성중", false, { plan: "마감완료", morning: "마감완료", afternoon: "작성중" }),
    ).toBe("afternoonClose");
  });
  it("afternoon 마감 → nightClose", () => {
    expect(
      legacyWriteMode("작성중", false, { plan: "마감완료", morning: "마감완료", afternoon: "마감완료" }),
    ).toBe("nightClose");
  });
  it("휴가 플래그 → vacation", () => {
    expect(legacyWriteMode("작성중", true, { plan: "작성중" })).toBe("vacation");
  });
  it("반려 → rejected (섹션 상태 무관)", () => {
    expect(legacyWriteMode("반려", false, { plan: "마감완료", afternoon: "재작성" })).toBe("rejected");
  });
  it("검수대기/승인/재제출 → view", () => {
    expect(legacyWriteMode("검수대기", false, {})).toBe("view");
    expect(legacyWriteMode("승인", false, {})).toBe("view");
    expect(legacyWriteMode("재제출", false, {})).toBe("view");
  });
  it("반려가 휴가보다 우선", () => {
    expect(legacyWriteMode("반려", true, {})).toBe("rejected");
  });
});

describe("legacyIsSubmitMode", () => {
  it("afternoonClose: 야간없음=제출, 야간있음=비제출", () => {
    expect(legacyIsSubmitMode("afternoonClose", "no")).toBe(true);
    expect(legacyIsSubmitMode("afternoonClose", "yes")).toBe(false);
  });
  it("nightClose/rejected/vacation은 제출", () => {
    expect(legacyIsSubmitMode("nightClose", null)).toBe(true);
    expect(legacyIsSubmitMode("rejected", null)).toBe(true);
    expect(legacyIsSubmitMode("vacation", null)).toBe(true);
  });
  it("morningPlan/morningClose는 비제출", () => {
    expect(legacyIsSubmitMode("morningPlan", null)).toBe(false);
    expect(legacyIsSubmitMode("morningClose", null)).toBe(false);
  });
});
