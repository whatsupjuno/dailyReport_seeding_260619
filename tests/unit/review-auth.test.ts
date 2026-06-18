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

describe("canReview", () => {
  it("그룹장은 자기 그룹 구성원 보고서 검수 가능", () => {
    expect(canReview(leader, owner(2, 1))).toBe(true);
  });
  it("그룹장은 자기 자신 보고서 셀프검수 불가", () => {
    expect(canReview(leader, owner(1, 1))).toBe(false);
  });
  it("그룹장은 타 그룹 보고서 검수 불가", () => {
    expect(canReview(leader, owner(5, 3))).toBe(false);
  });
  it("관리자는 타인 보고서 검수 가능, 자기 자신은 불가", () => {
    expect(canReview(admin, owner(2, 1))).toBe(true);
    expect(canReview(admin, owner(9, 1))).toBe(false);
  });
  it("직원은 검수 불가", () => {
    expect(canReview(employee, owner(3, 1))).toBe(false);
  });
});
