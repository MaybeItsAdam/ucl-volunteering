/**
 * The address check behind the timetable fetch: a feed host that resolves
 * into private, loopback or metadata space is refused. Copied from Adam's
 * Campus Toolbox (`src/lib/webhookUrl.ts`).
 */

/**
 * Whether an IPv4/IPv6 address is one this server must never fetch from.
 *
 * Covers loopback, RFC 1918 private space, link-local (which is how
 * `169.254.169.254` — the cloud metadata endpoint — is reached), CGNAT,
 * benchmarking, multicast and the IPv6 equivalents including
 * IPv4-mapped addresses, which are the standard way to smuggle `127.0.0.1`
 * past a v4-only check.
 */
export function isReservedAddress(address: string): boolean {
  const addr = address.toLowerCase();

  // IPv4-mapped and IPv4-compatible IPv6 (::ffff:127.0.0.1, ::127.0.0.1).
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isReservedAddress(mapped[1]);

  if (addr.includes(":")) {
    if (addr === "::" || addr === "::1") return true;
    // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast.
    if (/^f[cd]/.test(addr)) return true;
    if (/^fe[89ab]/.test(addr)) return true;
    if (/^ff/.test(addr)) return true;
    return false;
  }

  const parts = addr.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [a, b] = octets;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC 1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local — cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC 1918
  if (a === 192 && b === 168) return true; // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}
