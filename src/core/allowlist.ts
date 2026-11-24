
export const ALLOWED_HOSTS = ["api.github.com", "registry.npmjs.org", "pypi.org"] as const;

export class HostNotAllowedError extends Error {
  constructor(public readonly host: string, reason = "host not in allowlist") {
    super(`Outbound request blocked: ${host} (${reason})`);
    this.name = "HostNotAllowedError";
  }
}

export function assertAllowedUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    throw new HostNotAllowedError(String(input), "invalid URL");
  }
  if (url.protocol !== "https:") throw new HostNotAllowedError(url.host, "https required");
  if (url.username || url.password) throw new HostNotAllowedError(url.host, "credentials in URL");
  if (url.port && url.port !== "443") throw new HostNotAllowedError(url.host, "non-default port");
  if (!(ALLOWED_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) {
    throw new HostNotAllowedError(url.hostname);
  }
  return url;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** fetch wrapper enforcing the allowlist; `impl` is injectable for tests. Redirects are not followed blindly. */
export async function allowlistedFetch(
  input: string,
  init: RequestInit = {},
  impl: FetchLike = (u, i) => fetch(u, i),
): Promise<Response> {
  let url = assertAllowedUrl(input);
  for (let hop = 0; hop < 3; hop++) {
    const res = await impl(url.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = assertAllowedUrl(new URL(loc, url)); // redirect target must also be allowed
      continue;
    }
    return res;
  }
  throw new HostNotAllowedError(url.host, "too many redirects");
}
