import { describe, expect, it } from "vitest";
import {
  generateOtp,
  hashSecret,
  randomToken,
  safeEqual,
  signValue,
  verifySignedValue,
} from "@/lib/auth/crypto";

const SECRET = "test-secret";

describe("signValue / verifySignedValue", () => {
  it("서명 후 검증하면 원본 복원", () => {
    const signed = signValue("user-42", SECRET);
    expect(verifySignedValue(signed, SECRET)).toBe("user-42");
  });
  it("변조되면 null", () => {
    const signed = signValue("user-42", SECRET);
    expect(verifySignedValue(signed + "x", SECRET)).toBeNull();
  });
  it("다른 시크릿이면 null", () => {
    const signed = signValue("user-42", SECRET);
    expect(verifySignedValue(signed, "other")).toBeNull();
  });
  it("형식이 아니면 null", () => {
    expect(verifySignedValue("garbage", SECRET)).toBeNull();
  });
});

describe("generateOtp", () => {
  it("항상 4자리 숫자", () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{4}$/);
    }
  });
});

describe("safeEqual", () => {
  it("같으면 true, 다르면 false", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("hashSecret / randomToken", () => {
  it("같은 입력은 같은 해시, 다른 입력은 다른 해시", () => {
    expect(hashSecret("1234", SECRET)).toBe(hashSecret("1234", SECRET));
    expect(hashSecret("1234", SECRET)).not.toBe(hashSecret("1235", SECRET));
  });
  it("randomToken은 매번 다르고 충분히 길다", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});
