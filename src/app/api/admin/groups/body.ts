export interface ParsedGroupBody {
  name: string;
  leaderId: number | null;
  isAi?: boolean;
  writeStart?: string | null;
  writeEnd?: string | null;
  submitDue?: string | null;
  inviteAt?: string | null;
}

type ParseResult = { ok: true; body: ParsedGroupBody } | { ok: false; error: string };

const HM = /^([01]?\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLeaderId(value: unknown): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

function parseTime(value: unknown, message: string): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !HM.test(value)) return { ok: false, error: message };
  return { ok: true, value };
}

export function parseGroupBody(raw: unknown): ParseResult {
  if (!isRecord(raw)) return { ok: false, error: "요청 본문 형식이 올바르지 않습니다." };

  if (typeof raw.name !== "string" || !raw.name.trim()) return { ok: false, error: "그룹명을 입력해 주세요." };

  const leaderId = parseLeaderId(raw.leaderId);
  if (leaderId === undefined) return { ok: false, error: "잘못된 그룹장 ID입니다." };

  if (raw.isAi !== undefined && typeof raw.isAi !== "boolean") {
    return { ok: false, error: "AI 그룹 여부 형식이 올바르지 않습니다." };
  }

  const writeStart = parseTime(raw.writeStart, "작성 시작 시각 형식이 올바르지 않습니다.");
  if (!writeStart.ok) return writeStart;
  const writeEnd = parseTime(raw.writeEnd, "작성 종료 시각 형식이 올바르지 않습니다.");
  if (!writeEnd.ok) return writeEnd;
  const submitDue = parseTime(raw.submitDue, "자동제출 시각 형식이 올바르지 않습니다.");
  if (!submitDue.ok) return submitDue;
  const inviteAt = parseTime(raw.inviteAt, "작성 요청 메일 시각 형식이 올바르지 않습니다.");
  if (!inviteAt.ok) return inviteAt;

  return {
    ok: true,
    body: {
      name: raw.name.trim(),
      leaderId,
      isAi: raw.isAi,
      writeStart: writeStart.value,
      writeEnd: writeEnd.value,
      submitDue: submitDue.value,
      inviteAt: inviteAt.value,
    },
  };
}
