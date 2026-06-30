// @멘션 파싱 — 디자인 v5.0.15 명세의 정규식을 단일 출처로 보관(클라이언트 입력 스캔 + 서버 본문 해석 공용).

/** 커서 직전의 `@쿼리` 감지(자동완성 트리거). 그룹2=쿼리. */
export const MENTION_SCAN_RE = /(^|\s)@([^\s@]*)$/;

/** 본문 내 멘션 토큰 분리(렌더 강조 + 이름 추출). */
export const MENTION_SPLIT_RE = /@[^\s@.,!?()[\]{}:;]+/g;

/** 입력값 끝의 `@쿼리`를 스캔. 매칭이면 쿼리 문자열, 아니면 null. */
export function scanMention(value: string): string | null {
  const m = MENTION_SCAN_RE.exec(value ?? "");
  return m ? m[2] : null;
}

/** 직전 `@쿼리`를 `@이름␣`으로 치환(자동완성 선택). */
export function applyMention(value: string, name: string): string {
  return (value ?? "").replace(/@([^\s@]*)$/, "@" + name + " ");
}

export interface MentionToken {
  text: string;
  mention: boolean;
}

/** 본문 → [일반/멘션] 토큰 배열(순서 보존). 빈 본문도 1개 토큰. */
export function splitMentions(body: string): MentionToken[] {
  const out: MentionToken[] = [];
  const re = new RegExp(MENTION_SPLIT_RE.source, "g");
  const src = body ?? "";
  let last = 0;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(src))) {
    if (mm.index > last) out.push({ text: src.slice(last, mm.index), mention: false });
    out.push({ text: mm[0], mention: true });
    last = mm.index + mm[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), mention: false });
  if (out.length === 0) out.push({ text: src, mention: false });
  return out;
}

/** 본문에서 멘션된 이름(@ 제외) 추출 — 중복 제거. 서버 멘션 해석의 입력. */
export function extractMentionNames(body: string): string[] {
  const names = Array.from((body ?? "").match(MENTION_SPLIT_RE) ?? [], (t) => t.slice(1).trim()).filter(
    (n) => n.length > 0,
  );
  return Array.from(new Set(names));
}
