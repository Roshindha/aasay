import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  { ignores: [".next/**", "node_modules/**", "fixtures/**", "next-env.d.ts", ".assay-cache/**"] },
];
export default config;
