import { redirect } from "next/navigation";
import { todayKstISO } from "@/lib/date";

export default function ReportIndex() {
  redirect(`/report/${todayKstISO()}`);
}
