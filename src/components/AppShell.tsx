"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

export interface ShellUser {
  name: string;
  role: "employee" | "group_leader" | "admin";
  groupName: string | null;
  initial: string;
}

const NAV = [
  { key: "write", label: "작성", href: "/report", match: "/report" },
  { key: "list", label: "목록", href: "/reports", match: "/reports" },
  { key: "review", label: "검수", href: "/review", match: "/review", roles: ["group_leader", "admin"] },
  { key: "admin", label: "관리", href: "/admin/users", match: "/admin", roles: ["admin"] },
] as const;

export default function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 라우트 이동 시 좌측 드로어 자동 닫힘
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const items = NAV.filter((n) => !("roles" in n) || (n.roles as readonly string[]).includes(user.role));
  const adminSub = [
    { href: "/admin/users", label: "사용자 관리" },
    { href: "/admin/groups", label: "그룹 관리" },
    { href: "/admin/projects", label: "프로젝트 관리" },
  ];
  // 관리 하위메뉴 '메뉴' 라벨 스타일(디자인: 굵게·자간 정렬). LNB·드로어 공통.
  const subMenuLabelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#9AA1AE" };

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const active = (match: string) => pathname === match || pathname.startsWith(match + "/");

  return (
    <div>
      {/* 상단바 */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#fff",
          borderBottom: "1px solid #E2E5EB",
          height: 56,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 12,
        }}
      >
        {/* ☰ 로고 = 좌측 메뉴 토글(모바일). 데스크톱은 좌측 LNB가 항상 보이므로 드로어 미표시. */}
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label="메뉴 열기"
          aria-expanded={drawerOpen}
          data-testid="menu-toggle"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontFamily: "inherit",
            WebkitTapHighlightColor: "transparent",
            touchAction: "manipulation",
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "#3B5BDB",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <path d="M4 6.5h12M4 10h12M4 13.5h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Seeding</span>
        </button>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#F7F8FA",
            border: "1px solid #E2E5EB",
            borderRadius: 9999,
            padding: "4px 12px 4px 4px",
          }}
          data-testid="profile-pill"
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 9999,
              background: "#E0E7FF",
              color: "#2F49B0",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {user.initial}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#3A4150" }}>
            {user.name}
            {user.groupName ? ` · ${user.groupName}` : ""}
          </span>
        </div>
        <button
          onClick={logout}
          style={{
            height: 34,
            padding: "0 14px",
            border: "1px solid #CBD0D9",
            borderRadius: 8,
            background: "#fff",
            color: "#3A4150",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          로그아웃
        </button>
      </div>

      {/* 좌측 슬라이드 메뉴(모바일) — ☰ 토글. sm-only라 데스크톱(LNB 상시 노출)에선 미표시.
          배경/항목 모두 button·a(네이티브 탭) + touch-action으로 iOS 사파리 탭 보장. */}
      {drawerOpen && (
        <div className="sm-only">
          <button
            type="button"
            aria-label="메뉴 닫기"
            data-testid="drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            style={{ position: "fixed", top: 56, left: 0, right: 0, bottom: 0, zIndex: 60, background: "rgba(16,24,40,.4)", border: "none", padding: 0, cursor: "pointer", touchAction: "manipulation" }}
          />
          <nav
            data-testid="mobile-drawer"
            style={{ position: "fixed", top: 56, left: 0, bottom: 0, zIndex: 61, width: "min(264px, 82vw)", background: "#fff", borderRight: "1px solid #E2E5EB", padding: 12, display: "flex", flexDirection: "column", gap: 2, boxShadow: "4px 0 18px rgba(16,24,40,.16)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}
          >
            {items.map((n) => {
              const on = active(n.match);
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  data-testid={`drawer-nav-${n.key}`}
                  onClick={() => setDrawerOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", fontSize: 15, fontWeight: 600, padding: "12px 12px", borderRadius: 8, background: on ? "#EEF2FF" : "transparent", color: on ? "#2F49B0" : "#3A4150", touchAction: "manipulation" }}
                >
                  {n.label}
                </Link>
              );
            })}
            {user.role === "admin" && pathname.startsWith("/admin") && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...subMenuLabelStyle, padding: "4px 12px" }}>메뉴</div>
                {adminSub.map((s) => {
                  const on = active(s.href);
                  return (
                    <Link key={s.href} href={s.href} onClick={() => setDrawerOpen(false)} style={{ display: "block", textDecoration: "none", fontSize: 14, fontWeight: 600, padding: "10px 12px", borderRadius: 8, background: on ? "#EEF2FF" : "transparent", color: on ? "#2F49B0" : "#6B7280", touchAction: "manipulation" }}>{s.label}</Link>
                  );
                })}
              </div>
            )}
          </nav>
        </div>
      )}

      <div className="app-shell" style={{ alignItems: "flex-start" }}>
        {/* LNB (PC) */}
        <aside
          className="pc-only"
          style={{
            width: 220,
            flex: "none",
            background: "#fff",
            borderRight: "1px solid #E2E5EB",
            minHeight: "calc(100vh - 56px)",
            padding: "16px 12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((n) => {
              const on = active(n.match);
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  data-testid={`nav-${n.key}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: 600,
                    padding: 10,
                    borderRadius: 8,
                    background: on ? "#EEF2FF" : "transparent",
                    color: on ? "#2F49B0" : "#3A4150",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
            {/* 관리 하위 메뉴(사용자 관리 / 그룹 관리) — 디자인 사이드바 '메뉴' 섹션 */}
            {user.role === "admin" && pathname.startsWith("/admin") && (
              <div style={{ marginTop: 14 }} data-testid="admin-submenu">
                <div style={{ ...subMenuLabelStyle, padding: "4px 10px" }}>메뉴</div>
                {adminSub.map((s) => {
                  const on = active(s.href);
                  return (
                    <Link key={s.href} href={s.href} style={{ display: "block", textDecoration: "none", fontSize: 13, fontWeight: 600, padding: "8px 10px", borderRadius: 8, background: on ? "#EEF2FF" : "transparent", color: on ? "#2F49B0" : "#6B7280" }}>{s.label}</Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* 모바일 내비는 좌상단 ☰ → 좌측 슬라이드 드로어로 통일(위 drawerOpen 블록). 기존 가로 알약 내비 제거. */}

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
