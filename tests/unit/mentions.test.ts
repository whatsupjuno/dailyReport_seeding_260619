import { describe, expect, it } from "vitest";
import { applyMention, extractMentionNames, scanMention, splitMentions } from "@/lib/domain/mentions";

describe("scanMention — 커서 직전 @쿼리 감지", () => {
  it("끝에 @만 있으면 빈 쿼리", () => {
    expect(scanMention("@")).toBe("");
    expect(scanMention("안녕 @")).toBe("");
  });
  it("@쿼리가 끝에 있으면 쿼리 반환", () => {
    expect(scanMention("감사합니다 @이정")).toBe("이정");
    expect(scanMention("@김서")).toBe("김서");
  });
  it("멘션 뒤에 공백/텍스트가 오면 비활성(null)", () => {
    expect(scanMention("@이정민 확인")).toBeNull();
    expect(scanMention("그냥 텍스트")).toBeNull();
  });
  it("이메일처럼 @ 앞이 공백/시작이 아니면 비활성", () => {
    expect(scanMention("메일 a@b")).toBeNull();
  });
});

describe("applyMention — 직전 @쿼리를 @이름 으로 치환", () => {
  it("쿼리를 이름+공백으로 치환", () => {
    expect(applyMention("감사합니다 @이정", "이정민")).toBe("감사합니다 @이정민 ");
    expect(applyMention("@김", "김서연")).toBe("@김서연 ");
  });
});

describe("splitMentions — 본문 토큰 분리", () => {
  it("멘션/일반 토큰을 순서대로 분리", () => {
    expect(splitMentions("감사합니다 @이정민 확인")).toEqual([
      { text: "감사합니다 ", mention: false },
      { text: "@이정민", mention: true },
      { text: " 확인", mention: false },
    ]);
  });
  it("구두점은 멘션 토큰에 포함하지 않음", () => {
    expect(splitMentions("@김서연.")).toEqual([
      { text: "@김서연", mention: true },
      { text: ".", mention: false },
    ]);
  });
  it("멘션 없으면 단일 일반 토큰", () => {
    expect(splitMentions("그냥 텍스트")).toEqual([{ text: "그냥 텍스트", mention: false }]);
  });
});

describe("extractMentionNames — @ 제외 이름 추출(중복 제거)", () => {
  it("여러 멘션 이름을 추출", () => {
    expect(extractMentionNames("@이정민 님과 @박소라 님께")).toEqual(["이정민", "박소라"]);
  });
  it("중복 이름은 한 번만", () => {
    expect(extractMentionNames("@김도윤 @김도윤")).toEqual(["김도윤"]);
  });
  it("멘션 없으면 빈 배열", () => {
    expect(extractMentionNames("멘션 없음")).toEqual([]);
  });
});
