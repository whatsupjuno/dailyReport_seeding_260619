import { requireUser } from "@/lib/auth/guard";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell
      user={{
        name: user.name,
        role: user.role,
        groupName: user.group_name ?? null,
        initial: user.name.slice(0, 1),
      }}
    >
      {children}
    </AppShell>
  );
}
