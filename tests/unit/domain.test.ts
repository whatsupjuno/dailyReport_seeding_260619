import { describe, expect, it } from "vitest";
import { statusMeta, STATUS_META } from "@/lib/domain/status";
import {
  computeCompletion,
  delayState,
  editableSections,
  stepperFor,
  writePrimaryLabel,
} from "@/lib/domain/report";

describe("status meta", () => {
  it("완결/지연/검수대기 색이 디자인과 일치", () => {
    expect(statusMeta("완결").main).toBe("#1F9254");
    expect(statusMeta("지연").main).toBe("#DC2626");
    expect(statusMeta("검수대기").main).toBe("#B7860B");
  });
  it("미정의 라벨은 미작성으로 폴백", () => {
    expect(statusMeta("없는상태")).toEqual(STATUS_META["미작성"]);
  });
});

describe("computeCompletion", () => {
  it("완결율과 분류를 정확히 센다", () => {
    const c = computeCompletion([
      { status: "완결" },
      { status: "완결" },
      { status: "지연" },
      { status: "진행중" },
      { status: "계획" },
    ]);
    expect(c).toMatchObject({ total: 5, done: 2, delayed: 1, inProgress: 1, planned: 1 });
    expect(c.pct).toBe(40);
  });
  it("빈 목록은 0%", () => {
    expect(computeCompletion([]).pct).toBe(0);
  });
});

describe("stepperFor", () => {
  it("afternoonClose는 계획·오전 완결, 오후 current", () => {
    const s = stepperFor("afternoonClose");
    expect(s.find((n) => n.kind === "plan")!.state).toBe("완결");
    expect(s.find((n) => n.kind === "morning")!.state).toBe("완결");
    expect(s.find((n) => n.kind === "afternoon")!.current).toBe(true);
  });
  it("vacation은 전부 휴가", () => {
    expect(stepperFor("vacation").every((n) => n.state === "휴가")).toBe(true);
  });
  it("rejected는 오후가 반려 + current", () => {
    const a = stepperFor("rejected").find((n) => n.kind === "afternoon")!;
    expect(a.state).toBe("반려");
    expect(a.current).toBe(true);
  });
});

describe("writePrimaryLabel", () => {
  it("모드별 버튼 라벨", () => {
    expect(writePrimaryLabel("morningPlan", null)).toBe("계획 제출");
    expect(writePrimaryLabel("afternoonClose", null)).toBe("최종 제출");
    // 오후 마감에서 야간 '있음' → 제출이 아니라 야간 계획 저장(2단계)
    expect(writePrimaryLabel("afternoonClose", "yes")).toBe("야간 계획 저장");
    // 야간 마감 모드는 항상 최종 제출
    expect(writePrimaryLabel("nightClose", "yes")).toBe("최종 제출");
    expect(writePrimaryLabel("nightClose", "no")).toBe("최종 제출");
    expect(writePrimaryLabel("rejected", null)).toBe("재제출하기");
  });
});

describe("editableSections", () => {
  it("morningClose는 오전·오후 편집", () => {
    expect(editableSections("morningClose", null)).toEqual(["morning", "afternoon"]);
  });
  it("nightClose 야간없음은 편집 없음", () => {
    expect(editableSections("nightClose", "no")).toEqual([]);
  });
  it("view는 읽기전용", () => {
    expect(editableSections("view", null)).toEqual([]);
  });
});

describe("delayState", () => {
  const base = new Date("2026-06-18T11:00:00+09:00");
  const deadline = new Date("2026-06-18T11:50:00+09:00");
  it("마감 전 + 미완 + 30분 이내면 지연임박", () => {
    expect(delayState(true, new Date("2026-06-18T11:30:00+09:00"), deadline)).toBe("지연임박");
  });
  it("마감 초과 + 미완이면 지연", () => {
    expect(delayState(true, new Date("2026-06-18T12:10:00+09:00"), deadline)).toBe("지연");
  });
  it("여유 있으면 정상", () => {
    expect(delayState(true, base, deadline)).toBe("정상");
  });
  it("미완 없으면 항상 정상", () => {
    expect(delayState(false, new Date("2026-06-18T12:10:00+09:00"), deadline)).toBe("정상");
  });
});
