import { redirect } from "next/navigation";
import { getSessionUser } from "./session";
import type { UserRow } from "../data/users";

/** 세션 필수. 없으면 /login으로. */
export async function requireUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** 검수 권한(그룹장/관리자) 필수 */
export async function requireReviewer(): Promise<UserRow> {
  const user = await requireUser();
  if (user.role !== "group_leader" && user.role !== "admin") redirect("/report");
  return user;
}

/** 관리자 필수 */
export async function requireAdmin(): Promise<UserRow> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/report");
  return user;
}
