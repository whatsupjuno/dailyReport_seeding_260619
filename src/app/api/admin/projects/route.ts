import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { listProjects, createProject, PROJECT_STATUSES, type ProjectStatus } from "@/lib/data/projects";

type ProjectBody = Record<string, unknown>;

function objectBody(raw: unknown): ProjectBody {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw as ProjectBody : {};
}

function parseOwnerUserId(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === "string") return parseId(raw);
  return null;
}

/** 프로젝트 목록 — 관리자 전용. ?includeArchived=false 면 '보관' 제외. */
export async function GET(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const includeArchived = new URL(req.url).searchParams.get("includeArchived") !== "false";
  const projects = await listProjects({ includeArchived });
  return NextResponse.json({ ok: true, projects });
}

/** 프로젝트 생성 — 관리자 전용. 필수: 프로젝트명·고객명·담당자(owner). */
export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const body = objectBody(await req.json().catch(() => ({})));
  if (typeof body.name !== "string" || !body.name.trim()) return badRequest("프로젝트명을 입력해 주세요.");
  if (typeof body.custName !== "string" || !body.custName.trim()) return badRequest("고객명을 입력해 주세요.");
  if (body.custContact != null && typeof body.custContact !== "string") return badRequest("고객 연락처 형식이 올바르지 않습니다.");
  if (body.note != null && typeof body.note !== "string") return badRequest("메모 형식이 올바르지 않습니다.");
  const ownerUserId = parseOwnerUserId(body.ownerUserId);
  if (ownerUserId == null) return badRequest("담당자를 선택해 주세요.");
  if (body.status != null && (typeof body.status !== "string" || !PROJECT_STATUSES.includes(body.status as ProjectStatus))) return badRequest("알 수 없는 상태입니다.");
  const status = typeof body.status === "string" ? body.status as ProjectStatus : undefined;
  const custContact = typeof body.custContact === "string" ? body.custContact : null;
  const note = typeof body.note === "string" ? body.note : null;

  try {
    const res = await createProject({
      name: body.name.trim(),
      custName: body.custName.trim(),
      custContact,
      ownerUserId,
      status,
      note,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NAME_REQUIRED") return badRequest("프로젝트명을 입력해 주세요.");
    if (m === "CUST_NAME_REQUIRED") return badRequest("고객명을 입력해 주세요.");
    if (m === "OWNER_REQUIRED" || m === "OWNER_NOT_FOUND") return badRequest("담당자를 선택해 주세요.");
    if (m === "INVALID_STATUS") return badRequest("알 수 없는 상태입니다.");
    throw e;
  }
}
