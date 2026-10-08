import { describe, expect, it } from "vitest";
import { authCallbackUrl, safeReturnPath } from "./authCallback";

describe("sign-in callback origin", () => {
  it("returns people to whichever domain started sign-in", () => {
    expect(authCallbackUrl(new URL("https://ucl-volunteering.vercel.app/api/auth/start"))).toBe(
      "https://ucl-volunteering.vercel.app/auth/callback",
    );
    expect(authCallbackUrl(new URL("http://localhost:3000/api/auth/start"))).toBe("http://localhost:3000/auth/callback");
  });

  it("accepts an explicit return address only if it is exactly our callback", () => {
    const request = new URL("https://ucl-volunteering.vercel.app/api/auth/entra");
    expect(authCallbackUrl(request, "https://ucl-volunteering.vercel.app/auth/callback")).toBe(
      "https://ucl-volunteering.vercel.app/auth/callback",
    );
  });

  it("rejects another site, another path, or anything added", () => {
    const request = new URL("https://ucl-volunteering.vercel.app/api/auth/entra");
    expect(authCallbackUrl(request, "https://evil.example/auth/callback")).toBeNull();
    expect(authCallbackUrl(request, "https://ucl-volunteering.vercel.app/portal")).toBeNull();
    expect(authCallbackUrl(request, "https://ucl-volunteering.vercel.app/auth/callback?next=https://x.example")).toBeNull();
    expect(authCallbackUrl(request, "https://ucl-volunteering.vercel.app/auth/callback#x")).toBeNull();
    expect(authCallbackUrl(request, "not a url")).toBeNull();
  });
});

describe("return path after sign-in", () => {
  it("keeps a path on this site", () => {
    expect(safeReturnPath("/volunteer")).toBe("/volunteer");
    expect(safeReturnPath("/portal/calendar?week=2026-10-05")).toBe("/portal/calendar?week=2026-10-05");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "volunteer", "/a\nb", "", null, undefined]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});
