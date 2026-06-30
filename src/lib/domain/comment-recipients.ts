// 댓글/대댓글/@멘션 알림 수신자 산정 — 순수 로직(DB 무관, 단위 테스트 대상).
// 자기 자신 제외 + 한 이벤트에 한 사용자는 1건만(중복 제거; 멘션 우선)을 보장한다.
// 비활성/이메일 없음 같은 사용자 상태 필터는 호출측(notify.notifyComment)에서 적용한다.
//
// 주의: user id는 bigint(런타임에 node-pg가 문자열로 반환) ↔ number가 섞여 들어온다
// (getReviewOwner는 문자열, resolveMentions/parentAuthorId는 number). 비교·중복 제거는
// notify.ts 컨벤션과 동일하게 String 정규화로 수행한다(섞인 타입이 별도 키가 되는 버그 방지).

export type CommentNotifyKind = "comment" | "comment_reply" | "comment_mention";

/** 들어올 수 있는 id 표현(문자열 bigint 또는 number). */
type Id = number | string;

export interface CommentRecipient {
  userId: number;
  kind: CommentNotifyKind;
}

export interface CommentRecipientInput {
  /** 댓글 작성자(항상 수신자에서 제외) */
  authorId: Id;
  /** 보고서 owner(작성자 본인) */
  ownerId: Id;
  /**
   * 보고서 검수자(그룹장 실체, leader_user_id). 없으면 null.
   * owner가 작성한 '최상위 댓글'의 스레드 상대편으로만 쓰인다.
   */
  reviewerId: Id | null;
  /** 대댓글 여부(부모가 있으면 true) */
  isReply: boolean;
  /** 대댓글일 때 '내가 답글을 단 부모 댓글'의 작성자. 없으면 null. */
  parentAuthorId: Id | null;
  /** task_comments.mentions — 서버에서 해석된 멘션 대상 사용자 id(본문 재파싱 금지) */
  mentions: Id[];
}

const norm = (v: Id): string => String(v);

/**
 * 수신자 규칙:
 * - 최상위 댓글: 보고서 owner(작성자 본인 아니면) + 작성자가 owner면 그 보고서 검수자(그룹장). = "스레드 상대편".
 * - 대댓글: 부모 댓글 author(본인 아니면) + 보고서 owner(본인 아니면). = "스레드 참여자".
 * - @멘션: mentions[]의 각 사용자(작성자 본인 제외). kind=comment_mention.
 * - 공통: 자기 자신 제외, 한 사용자는 1건만(멘션이 스레드 종류를 덮어써 우선).
 */
export function computeCommentRecipients(input: CommentRecipientInput): CommentRecipient[] {
  const { authorId, ownerId, reviewerId, isReply, parentAuthorId, mentions } = input;
  const author = norm(authorId);
  // Map(문자열 키)의 삽입 순서를 보존하며, 같은 키 재지정 시 값만 갱신(멘션 우선 승격에 사용).
  const byUser = new Map<string, CommentNotifyKind>();

  // 1) 스레드 기반 수신자(comment / comment_reply)
  const threadKind: CommentNotifyKind = isReply ? "comment_reply" : "comment";
  const threadTargets: string[] = [];
  if (isReply) {
    if (parentAuthorId != null) threadTargets.push(norm(parentAuthorId));
    threadTargets.push(norm(ownerId));
  } else if (norm(ownerId) !== author) {
    threadTargets.push(norm(ownerId));
  } else if (reviewerId != null) {
    threadTargets.push(norm(reviewerId));
  }
  for (const uid of threadTargets) {
    if (uid === author) continue; // 자기 제외
    if (!byUser.has(uid)) byUser.set(uid, threadKind); // 중복 제거(먼저 잡힌 종류 유지)
  }

  // 2) @멘션 — 우선순위 최상(이미 스레드로 잡혀 있어도 comment_mention으로 승격)
  for (const m of mentions) {
    const uid = norm(m);
    if (uid === author) continue; // 자기 멘션 제외
    byUser.set(uid, "comment_mention"); // 덮어써서 멘션 우선
  }

  return Array.from(byUser, ([userId, kind]) => ({ userId: Number(userId), kind }));
}
