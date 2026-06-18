import Link from "next/link";
import { requireReviewer } from "@/lib/auth/guard";
import { reviewQueueForReviewer } from "@/lib/data/review";
import { shortDate, weekday } from "@/lib/date";

export default async function ReviewQueuePage() {
  const user = await requireReviewer();
  const items = await reviewQueueForReviewer(user);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px" }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>검수 대기</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4, marginBottom: 22 }}>
        {user.role === "admin" ? "전체" : user.group_name} · 검수 대기 {items.length}건
      </div>

      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }} data-testid="review-queue">
        {items.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "#9AA1AE" }}>검수할 보고서가 없습니다.</div>
        )}
        {items.map((it) => (
          <Link
            key={it.report_id}
            href={`/review/${it.report_id}`}
            data-testid={`queue-item-${it.report_id}`}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderTop: "1px solid #F2F3F6", textDecoration: "none", color: "#1A1F2B" }}
          >
            <div style={{ width: 34, height: 34, borderRadius: 9999, background: "#E0E7FF", color: "#2F49B0", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {it.name.slice(0, 1)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
              <div style={{ fontSize: 12, color: "#9AA1AE" }}>{it.dept}</div>
            </div>
            <div style={{ fontSize: 13, color: "#6B7280" }} className="tnum">
              {shortDate(it.report_date)} ({weekday(it.report_date)})
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#B7860B", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 6, padding: "3px 9px" }}>검수대기</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
