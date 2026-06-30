import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { updateProject, removeProject, PROJECT_STATUSES, type ProjectStatus } from "@/lib/data/projects";

/** 프로젝트 수정 — 관리자 전용. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const projectId = parseId(id);
  if (projectId == null) return badRequest("잘못된 프로젝트 ID입니다.");

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
    await updateProject(projectId, {
      name: body.name.trim(),
      custName: body.custName.trim(),
      custContact: body.custContact ?? null,
      ownerUserId: body.ownerUserId,
      status: body.status,
      note: body.note ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_FOUND") return badRequest("프로젝트를 찾을 수 없습니다.");
    if (m === "NAME_REQUIRED") return badRequest("프로젝트명을 입력해 주세요.");
    if (m === "CUST_NAME_REQUIRED") return badRequest("고객명을 입력해 주세요.");
    if (m === "OWNER_REQUIRED" || m === "OWNER_NOT_FOUND") return badRequest("담당자를 선택해 주세요.");
    if (m === "INVALID_STATUS") return badRequest("알 수 없는 상태입니다.");
    throw e;
  }
}

/** 프로젝트 삭제 — 관리자 전용. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const projectId = parseId(id);
  if (projectId == null) return badRequest("잘못된 프로젝트 ID입니다.");
  try {
    await removeProject(projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return badRequest("프로젝트를 찾을 수 없습니다.");
    throw e;
  }
}
