import { describe, expect, it } from "vitest";
import { canReview } from "@/lib/data/review";
import type { UserRow } from "@/lib/data/users";
import type { ReviewOwner } from "@/lib/data/review";

const leader = { id: 1, role: "group_leader" } as UserRow;
const admin = { id: 9, role: "admin" } as UserRow;
const employee = { id: 2, role: "employee" } as UserRow;

const owner = (user_id: number, leader_user_id: number | null): ReviewOwner => ({
  user_id,
  name: "x",
  group_id: 1,
  group_name: "개발팀",
  leader_user_id,
  role: "employee",
});

// 브리프 §3: 검수 액션 권한은 'owner 그룹의 그룹장 실체(leader_user_id)'로만 결정(역할 라벨 무관).
// 관리자(role=admin) 자체로는 검수 액션 불가(열람 전용) — 단, 어떤 그룹의 leader_user_id이면 그 실체로 가능.
describe("canReview (그룹장 실체 기준)", () => {
  it("그룹장은 자기 그룹 구성원 보고서 검수 가능", () => {
    expect(canReview(leader, owner(2, 1))).toBe(true);
  });
  it("그룹장은 자기 자신 보고서 셀프검수 불가", () => {
    expect(canReview(leader, owner(1, 1))).toBe(false);
  });
  it("그룹장은 타 그룹 보고서 검수 불가", () => {
    expect(canReview(leader, owner(5, 3))).toBe(false);
  });
  it("관리자 단독(어느 그룹의 그룹장도 아님)은 타인 보고서 검수 불가(열람전용)", () => {
    expect(canReview(admin, owner(2, 1))).toBe(false);
  });
  it("관리자라도 owner 그룹의 leader_user_id이면 그 실체로 검수 가능(방준호=admin+그룹장)", () => {
    expect(canReview(admin, owner(2, 9))).toBe(true); // admin.id=9가 owner 그룹의 그룹장
    expect(canReview(admin, owner(9, 9))).toBe(false); // 본인 보고서는 셀프검수 불가
  });
  it("직원은 검수 불가", () => {
    expect(canReview(employee, owner(3, 1))).toBe(false);
  });
});
