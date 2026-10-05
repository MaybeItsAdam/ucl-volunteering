import { describe, expect, it } from "vitest";
import { isReservedAddress } from "./reservedAddress";

describe("isReservedAddress", () => {
  it("catches the IPv4 ranges that must never be fetched", () => {
    for (const address of [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      // The cloud metadata endpoint. This is the single address this whole
      // module exists to keep out.
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isReservedAddress(address), address).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const address of ["1.1.1.1", "8.8.8.8", "172.32.0.1", "93.184.216.34"]) {
      expect(isReservedAddress(address), address).toBe(false);
    }
  });

  it("catches IPv6 loopback, unique-local and link-local", () => {
    for (const address of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isReservedAddress(address), address).toBe(true);
    }
    expect(isReservedAddress("2606:4700::1111")).toBe(false);
  });

  /**
   * IPv4-mapped IPv6 is the standard way to smuggle a loopback address past a
   * check that only knows about dotted quads.
   */
  it("unwraps IPv4-mapped IPv6 rather than passing it", () => {
    expect(isReservedAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isReservedAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isReservedAddress("::127.0.0.1")).toBe(true);
    expect(isReservedAddress("::ffff:8.8.8.8")).toBe(false);
  });
});
