/// Optional peer modules pulled in by wallet connectors KLUB does not use
/// (Coinbase/Base smart accounts, logging pretty-printers). Aliasing them to
/// false keeps the bundle building without installing them.
const unusedOptional = ["@react-native-async-storage/async-storage", "@base-org/account", "@coinbase/cdp-sdk", "pino-pretty", "lokijs", "encoding"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // static site: no server, deployable to IPFS or Vercel
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias };
    for (const name of unusedOptional) config.resolve.alias[name] = false;
    return config;
  }
};
export default nextConfig;
