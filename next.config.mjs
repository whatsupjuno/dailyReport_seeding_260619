/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 서버에서 pg 네이티브 의존성 번들 제외
  serverExternalPackages: ["pg"],
};

export default nextConfig;
