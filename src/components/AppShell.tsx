"use client";

import { usePathname, useRouter } from "next/navigation";
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

  const items = NAV.filter((n) => !("roles" in n) || (n.roles as readonly string[]).includes(user.role));

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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
        </div>
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

      <div style={{ display: "flex", alignItems: "flex-start" }}>
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
          </div>
        </aside>

        {/* 모바일 가로 내비 */}
        <div className="sm-only" style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              gap: 6,
              overflowX: "auto",
              padding: "10px 12px",
              background: "#fff",
              borderBottom: "1px solid #E2E5EB",
            }}
          >
            {items.map((n) => {
              const on = active(n.match);
              return (
                <Link
                  key={n.key}
                  href={n.href}
                  style={{
                    whiteSpace: "nowrap",
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: "7px 12px",
                    borderRadius: 9999,
                    background: on ? "#3B5BDB" : "#F7F8FA",
                    color: on ? "#fff" : "#3A4150",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
