/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // static site: no server, deployable to IPFS or Vercel
  images: { unoptimized: true },
  reactStrictMode: true
};
export default nextConfig;
