import { describe, expect, it } from "vitest";
import { reportDateForBoundary, todayKstISO } from "@/lib/date";
import { boundaryHour, weekdayOnly, use24h, DEFAULT_WINDOW, type GroupWindow } from "@/lib/domain/window";

const ai: GroupWindow = { isAi: true, writeStart: "09:00:00", writeEnd: "08:59:00", submitDue: "09:00:00" };
const sales: GroupWindow = { isAi: false, writeStart: "08:00:00", writeEnd: "18:59:00", submitDue: "20:00:00" };

describe("reportDateForBoundary", () => {
  it("boundary 0 = todayKstISO(now)", () => {
    const now = new Date("2026-06-27T08:59:00+09:00");
    expect(reportDateForBoundary(0, now)).toBe(todayKstISO(now));
    expect(reportDateForBoundary(0, now)).toBe("2026-06-27");
  });
  it("boundary 9 (AI): 08:59 KST → 전날(윈도우 시작일)", () => {
    expect(reportDateForBoundary(9, new Date("2026-06-27T08:59:00+09:00"))).toBe("2026-06-26");
  });
  it("boundary 9 (AI): 09:00 KST → 당일(새 윈도우 시작)", () => {
    expect(reportDateForBoundary(9, new Date("2026-06-27T09:00:00+09:00"))).toBe("2026-06-27");
  });
  it("boundary 9 (AI): 23:00 KST → 당일", () => {
    expect(reportDateForBoundary(9, new Date("2026-06-27T23:00:00+09:00"))).toBe("2026-06-27");
  });
  it("boundary 9 (AI): 00:30 KST → 전날", () => {
    expect(reportDateForBoundary(9, new Date("2026-06-27T00:30:00+09:00"))).toBe("2026-06-26");
  });
});

describe("GroupWindow 파생", () => {
  it("boundaryHour: AI=9, 비-AI=0", () => {
    expect(boundaryHour(ai)).toBe(9);
    expect(boundaryHour(sales)).toBe(0);
  });
  it("weekdayOnly: 비-AI만 true", () => {
    expect(weekdayOnly(ai)).toBe(false);
    expect(weekdayOnly(sales)).toBe(true);
  });
  it("use24h: AI만 true", () => {
    expect(use24h(ai)).toBe(true);
    expect(use24h(sales)).toBe(false);
  });
  it("DEFAULT_WINDOW은 비-AI·자정·자동제출 OFF", () => {
    expect(DEFAULT_WINDOW.isAi).toBe(false);
    expect(boundaryHour(DEFAULT_WINDOW)).toBe(0);
    expect(DEFAULT_WINDOW.submitDue).toBeNull();
  });
});
