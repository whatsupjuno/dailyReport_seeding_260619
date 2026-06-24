import { describe, expect, it } from "vitest";
import { classifyTask, bucketTasks, kstHour, type ClassifiableTask } from "@/lib/domain/classify";

// KST 시각 헬퍼로 completed_at 생성 (UTC+9 고정). 11:59 KST = 02:59Z, 12:00 KST = 03:00Z
const at = (kstIso: string): Date => new Date(kstIso);

const task = (o: Partial<ClassifiableTask>): ClassifiableTask => ({
  status: "완결",
  completed_at: null,
  is_night: false,
  ...o,
});

describe("kstHour", () => {
  it("UTC+9로 환산", () => {
    expect(kstHour(new Date("2026-06-19T02:59:00Z"))).toBe(11); // 11:59 KST
    expect(kstHour(new Date("2026-06-19T03:00:00Z"))).toBe(12); // 12:00 KST
    expect(kstHour(new Date("2026-06-19T11:00:00Z"))).toBe(20); // 20:00 KST
  });
});

describe("classifyTask (디자인 classifyTasks 계승)", () => {
  it("11:59 마감 → 오전", () => {
    expect(classifyTask(task({ completed_at: at("2026-06-19T11:59:00+09:00") }), false)).toBe("am");
  });
  it("12:00 마감 → 오후", () => {
    expect(classifyTask(task({ completed_at: at("2026-06-19T12:00:00+09:00") }), false)).toBe("pm");
  });
  it("미완료(계획/진행중) → todo", () => {
    expect(classifyTask(task({ status: "진행중", completed_at: null }), false)).toBe("todo");
    expect(classifyTask(task({ status: "계획", completed_at: null }), false)).toBe("todo");
  });
  it("지연도 completed_at 있으면 시각으로 분류", () => {
    expect(classifyTask(task({ status: "지연", completed_at: at("2026-06-19T09:00:00+09:00") }), false)).toBe("am");
  });
  it("is_night 플래그 → 야간(토글 on), 토글 off면 숨김(null) — 완료 여부 무관 (C1 우선)", () => {
    const night = task({ is_night: true, status: "계획", completed_at: null });
    expect(classifyTask(night, true)).toBe("night");
    expect(classifyTask(night, false)).toBe(null);
  });
  it("is_night=true·status=계획·completed_at=NULL: nightOn이면 야간, 아니면 숨김 (B5/디자인)", () => {
    const t = task({ is_night: true, status: "계획", completed_at: null });
    expect(classifyTask(t, true)).toBe("night");
    expect(classifyTask(t, false)).toBe(null);
  });
  it("완결인데 completed_at=NULL이면 crash 없이 todo (방어)", () => {
    expect(classifyTask(task({ status: "완결", completed_at: null }), false)).toBe("todo");
  });
  it("파싱 불가한 completed_at은 오후로 오분류하지 않고 todo", () => {
    expect(classifyTask(task({ status: "완결", completed_at: "not-a-date" }), false)).toBe("todo");
  });
});

describe("bucketTasks", () => {
  it("버킷 분류 + 정렬(오전/오후 완료시각 오름차순, todo는 입력 순서 유지=드래그 재정렬)", () => {
    const tasks = [
      task({ status: "완결", completed_at: at("2026-06-19T10:30:00+09:00"), is_night: false }), // am
      task({ status: "완결", completed_at: at("2026-06-19T09:00:00+09:00"), is_night: false }), // am (먼저)
      task({ status: "완결", completed_at: at("2026-06-19T15:00:00+09:00"), is_night: false }), // pm
      task({ status: "계획", completed_at: null }), // todo (입력 1번째)
      task({ status: "진행중", completed_at: null }), // todo (입력 2번째)
      task({ status: "완결", is_night: true, completed_at: at("2026-06-19T21:00:00+09:00") }), // night
    ];
    const b = bucketTasks(tasks, true);
    expect(b.am).toHaveLength(2);
    expect(kstHour(b.am[0].completed_at as Date)).toBe(9); // 정렬 확인
    expect(b.pm).toHaveLength(1);
    expect(b.night).toHaveLength(1);
    expect(b.todo).toHaveLength(2);
    // 자동 정렬 제거: 입력 순서 그대로(계획 → 진행중). 진행중 우선 정렬하지 않음.
    expect(b.todo[0].status).toBe("계획");
    expect(b.todo[1].status).toBe("진행중");
  });
  it("nightOn=false면 야간 task는 어디에도 안 들어감(숨김)", () => {
    const tasks = [task({ is_night: true, status: "완결", completed_at: at("2026-06-19T21:00:00+09:00") })];
    const b = bucketTasks(tasks, false);
    expect(b.night).toHaveLength(0);
    expect(b.am.length + b.pm.length + b.todo.length).toBe(0);
  });
});
