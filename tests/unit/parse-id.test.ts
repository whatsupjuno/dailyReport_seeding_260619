import { describe, expect, it } from "vitest";
import { parseId } from "@/lib/auth/api";

describe("parseId (정규 10진수만 허용)", () => {
  it("정상 양의 정수", () => {
    expect(parseId("1")).toBe(1);
    expect(parseId("42")).toBe(42);
    expect(parseId("100000")).toBe(100000);
  });
  it("비정규/거대/부호/지수/16진수 차단(DB 범위초과 500 방지)", () => {
    for (const bad of ["0", "-1", "1e3", "0x10", "0b101", "+5", "5.0", " 5", "5 ", "01", "9999999999999999999999", "", "abc", "1.5"]) {
      expect(parseId(bad)).toBeNull();
    }
  });
});
