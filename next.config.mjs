/** @type {import('next').NextConfig} */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const nextConfig = {
  turbopack: { root },
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
};
export default nextConfig;
