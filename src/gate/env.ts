/** Variables a check subprocess may inherit. Everything else is dropped. */
export const ENV_ALLOWLIST = ["PATH", "LANG", "LC_ALL", "TERM", "TZ", "SHELL"] as const;
/** Belt and braces: even an allowlisted/overridden name is dropped when it looks like a credential. */
export const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION/i;

export function buildCheckEnv(parent: NodeJS.ProcessEnv, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of ENV_ALLOWLIST) {
    const v = parent[name];
    if (v !== undefined && !SECRET_NAME.test(name)) env[name] = v;
  }
  for (const [k, v] of Object.entries(extra)) if (!SECRET_NAME.test(k)) env[k] = v;
  return env;
}
