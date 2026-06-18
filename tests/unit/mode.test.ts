import { describe, expect, it } from "vitest";
import { computeWriteMode, isSubmitMode } from "@/lib/domain/mode";

describe("computeWriteMode", () => {
  it("초기(plan 미마감) → morningPlan", () => {
    expect(computeWriteMode("작성중", false, { plan: "작성중" })).toBe("morningPlan");
  });
  it("plan 마감 → morningClose", () => {
    expect(computeWriteMode("작성중", false, { plan: "마감완료", morning: "작성중" })).toBe("morningClose");
  });
  it("morning 마감 → afternoonClose", () => {
    expect(
      computeWriteMode("작성중", false, { plan: "마감완료", morning: "마감완료", afternoon: "작성중" }),
    ).toBe("afternoonClose");
  });
  it("afternoon 마감 → nightClose", () => {
    expect(
      computeWriteMode("작성중", false, { plan: "마감완료", morning: "마감완료", afternoon: "마감완료" }),
    ).toBe("nightClose");
  });
  it("휴가 플래그 → vacation", () => {
    expect(computeWriteMode("작성중", true, { plan: "작성중" })).toBe("vacation");
  });
  it("반려 → rejected (섹션 상태 무관)", () => {
    expect(computeWriteMode("반려", false, { plan: "마감완료", afternoon: "재작성" })).toBe("rejected");
  });
  it("검수대기/승인/재제출 → view", () => {
    expect(computeWriteMode("검수대기", false, {})).toBe("view");
    expect(computeWriteMode("승인", false, {})).toBe("view");
    expect(computeWriteMode("재제출", false, {})).toBe("view");
  });
  it("반려가 휴가보다 우선", () => {
    expect(computeWriteMode("반려", true, {})).toBe("rejected");
  });
});

describe("isSubmitMode", () => {
  it("afternoonClose: 야간없음=제출, 야간있음=비제출", () => {
    expect(isSubmitMode("afternoonClose", "no")).toBe(true);
    expect(isSubmitMode("afternoonClose", "yes")).toBe(false);
  });
  it("nightClose/rejected/vacation은 제출", () => {
    expect(isSubmitMode("nightClose", null)).toBe(true);
    expect(isSubmitMode("rejected", null)).toBe(true);
    expect(isSubmitMode("vacation", null)).toBe(true);
  });
  it("morningPlan/morningClose는 비제출", () => {
    expect(isSubmitMode("morningPlan", null)).toBe(false);
    expect(isSubmitMode("morningClose", null)).toBe(false);
  });
});
