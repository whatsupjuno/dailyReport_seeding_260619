import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { listProjects, createProject, PROJECT_STATUSES, type ProjectStatus } from "@/lib/data/projects";

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

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    custName?: string;
    custContact?: string | null;
    ownerUserId?: number | null;
    status?: ProjectStatus;
    note?: string | null;
  };
  if (!body.name?.trim()) return badRequest("프로젝트명을 입력해 주세요.");
  if (!body.custName?.trim()) return badRequest("고객명을 입력해 주세요.");
  if (body.ownerUserId == null) return badRequest("담당자를 선택해 주세요.");
  if (body.status != null && !PROJECT_STATUSES.includes(body.status)) return badRequest("알 수 없는 상태입니다.");

  try {
    const res = await createProject({
      name: body.name.trim(),
      custName: body.custName.trim(),
      custContact: body.custContact ?? null,
      ownerUserId: body.ownerUserId,
      status: body.status,
      note: body.note ?? null,
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
