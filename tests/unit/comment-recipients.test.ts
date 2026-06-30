import { describe, expect, it } from "vitest";
import { computeCommentRecipients } from "@/lib/domain/comment-recipients";

// 수신자 규칙(브리프 §4): 댓글/대댓글/멘션, 자기 제외, 한 사용자 1건(멘션 우선).
// id 규약: 1=그룹장(검수자), 2=보고서 owner(직원), 3=제3자.

describe("computeCommentRecipients — 최상위 댓글", () => {
  it("owner(직원)가 작성 → 검수자(그룹장)에게 comment 1건", () => {
    expect(
      computeCommentRecipients({ authorId: 2, ownerId: 2, reviewerId: 1, isReply: false, parentAuthorId: null, mentions: [] }),
    ).toEqual([{ userId: 1, kind: "comment" }]);
  });

  it("검수자(그룹장)가 작성 → owner(직원)에게 comment 1건", () => {
    expect(
      computeCommentRecipients({ authorId: 1, ownerId: 2, reviewerId: 1, isReply: false, parentAuthorId: null, mentions: [] }),
    ).toEqual([{ userId: 2, kind: "comment" }]);
  });

  it("owner가 작성했으나 검수자(그룹장) 없음 → 수신자 없음", () => {
    expect(
      computeCommentRecipients({ authorId: 2, ownerId: 2, reviewerId: null, isReply: false, parentAuthorId: null, mentions: [] }),
    ).toEqual([]);
  });

  it("owner가 작성하고 검수자가 본인(셀프검수) → 자기 제외로 수신자 없음", () => {
    expect(
      computeCommentRecipients({ authorId: 2, ownerId: 2, reviewerId: 2, isReply: false, parentAuthorId: null, mentions: [] }),
    ).toEqual([]);
  });
});

describe("computeCommentRecipients — 대댓글", () => {
  it("검수자가 owner 댓글에 답글 → 부모 author(=owner)에게 comment_reply 1건(중복 제거)", () => {
    // parentAuthor=2, owner=2 → 중복 제거되어 1건
    expect(
      computeCommentRecipients({ authorId: 1, ownerId: 2, reviewerId: 1, isReply: true, parentAuthorId: 2, mentions: [] }),
    ).toEqual([{ userId: 2, kind: "comment_reply" }]);
  });

  it("owner가 검수자 댓글에 답글 → 부모 author(검수자)에게 comment_reply(owner 본인은 제외)", () => {
    expect(
      computeCommentRecipients({ authorId: 2, ownerId: 2, reviewerId: 1, isReply: true, parentAuthorId: 1, mentions: [] }),
    ).toEqual([{ userId: 1, kind: "comment_reply" }]);
  });

  it("부모 author와 owner가 모두 작성자 본인이면 수신자 없음", () => {
    expect(
      computeCommentRecipients({ authorId: 2, ownerId: 2, reviewerId: 1, isReply: true, parentAuthorId: 2, mentions: [] }),
    ).toEqual([]);
  });
});

describe("computeCommentRecipients — @멘션 + 우선/중복/자기제외", () => {
  it("멘션 대상에게 comment_mention(작성자 본인 멘션은 제외)", () => {
    // author=owner=1, 검수자 없음 → 스레드 수신자 없이 멘션만 격리 검증
    expect(
      computeCommentRecipients({ authorId: 1, ownerId: 1, reviewerId: null, isReply: false, parentAuthorId: null, mentions: [1, 2, 3] }),
    ).toEqual([
      { userId: 2, kind: "comment_mention" },
      { userId: 3, kind: "comment_mention" },
    ]);
  });

  it("스레드 수신자가 멘션도 되면 comment_mention으로 승격(1건만, 멘션 우선)", () => {
    // owner(직원)가 검수자(1)를 멘션한 최상위 댓글 → 검수자는 comment가 아니라 comment_mention 1건
    expect(
      computeCommentRecipients({ authorId: 2, ownerId: 2, reviewerId: 1, isReply: false, parentAuthorId: null, mentions: [1] }),
    ).toEqual([{ userId: 1, kind: "comment_mention" }]);
  });

  it("멘션 배열 내 중복은 1건으로", () => {
    // author=owner=1, 검수자 없음 → 멘션 중복 제거만 격리 검증
    expect(
      computeCommentRecipients({ authorId: 1, ownerId: 1, reviewerId: null, isReply: false, parentAuthorId: null, mentions: [2, 2] }),
    ).toEqual([{ userId: 2, kind: "comment_mention" }]);
  });

  it("대댓글 + 멘션 혼합: 스레드(comment_reply) + 멘션(comment_mention) 분리, 자기 제외", () => {
    // 작성자 1, 부모 author=1(본인 제외), owner=2 → comment_reply; 멘션 3 → comment_mention
    expect(
      computeCommentRecipients({ authorId: 1, ownerId: 2, reviewerId: null, isReply: true, parentAuthorId: 1, mentions: [3] }),
    ).toEqual([
      { userId: 2, kind: "comment_reply" },
      { userId: 3, kind: "comment_mention" },
    ]);
  });
});
