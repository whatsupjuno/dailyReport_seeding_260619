import { requireAdmin } from "@/lib/auth/guard";
import { listProjects } from "@/lib/data/projects";
import { listUsers } from "@/lib/data/users";
import ProjectsAdmin from "@/components/admin/ProjectsAdmin";

export default async function AdminProjectsPage() {
  await requireAdmin();
  const [projects, users] = await Promise.all([listProjects({ includeArchived: true }), listUsers()]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "30px" }}>프로젝트 관리</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 16 }}>
        여기서 등록한 프로젝트가 보고서 작성 시 ‘프로젝트’ 지정 항목으로 표시됩니다.
      </div>
      <ProjectsAdmin
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          cust_name: p.cust_name,
          cust_contact: p.cust_contact,
          owner_user_id: p.owner_user_id,
          owner_name: p.owner_name,
          status: p.status,
          note: p.note,
        }))}
        users={users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }))}
      />
    </div>
  );
}
