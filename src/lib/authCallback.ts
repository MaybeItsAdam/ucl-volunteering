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
