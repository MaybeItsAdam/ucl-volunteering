/**
 * Where the Toolbox should send someone back to after UCL sign-in: this site's
 * own /auth/callback, on the same origin that started the sign-in. A requested
 * return address is only accepted if it is exactly that, with nothing added.
 */
export function authCallbackUrl(requestUrl: URL, requestedReturnTo?: string | null): string | null {
  const callback = new URL("/auth/callback", requestUrl.origin);
  if (!requestedReturnTo) return callback.toString();

  let candidate: URL;
  try {
    candidate = new URL(requestedReturnTo);
  } catch {
    return null;
  }

  if (
    candidate.origin !== requestUrl.origin ||
    candidate.pathname !== callback.pathname ||
    candidate.search ||
    candidate.hash ||
    candidate.username ||
    candidate.password
  ) {
    return null;
  }
  return candidate.toString();
}

/** Where sign-in remembers to send someone back to, between /api/auth/start and the exchange. */
export const RETURN_COOKIE = "volsoc_return";

/**
 * A page on this site to land on after sign-in (`/volunteer`), or null. Only
 * a plain path: `//host` and `/\host` are other sites to a browser.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || value.length > 200 || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\") || /[\u0000-\u001f\\]/.test(value)) return null;
  return value;
}
