import { redirect } from "next/navigation";

export default function Home() {
  // 인증 미들웨어/세션이 붙기 전까지 임시로 로그인으로 보냄
  redirect("/login");
}
