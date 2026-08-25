import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientIp, hashIp } from "../client-ip";

function request(headers: Record<string, string>): Request {
  return new Request("https://milliondollarpage.fun/api/reservations", { headers });
}

describe("clientIp", () => {
  // Snapshot and restore rather than leaving the environment as we found it by
  // luck: the suite is single-fork, so what one file deletes another inherits.
  const original = { ...process.env };

  beforeEach(() => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    delete process.env.ALLOW_UNTRUSTED_CLIENT_IP;
    delete process.env.TRUSTED_PLATFORM_HEADER;
  });

  afterEach(() => {
    process.env.TRUSTED_PROXY_HOPS = original.TRUSTED_PROXY_HOPS;
    if (original.ALLOW_UNTRUSTED_CLIENT_IP === undefined) {
      delete process.env.ALLOW_UNTRUSTED_CLIENT_IP;
    } else {
      process.env.ALLOW_UNTRUSTED_CLIENT_IP = original.ALLOW_UNTRUSTED_CLIENT_IP;
    }
    if (original.TRUSTED_PLATFORM_HEADER === undefined) {
      delete process.env.TRUSTED_PLATFORM_HEADER;
    } else {
      process.env.TRUSTED_PLATFORM_HEADER = original.TRUSTED_PLATFORM_HEADER;
    }
  });

  it("trusts a platform header only once told which platform we are behind", () => {
    process.env.TRUSTED_PLATFORM_HEADER = "cf-connecting-ip";
    const identity = clientIp(request({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }));
    expect(identity).toEqual({ ok: true, ip: "1.2.3.4", source: "cf-connecting-ip" });
  });

  it("is not fooled by an attacker-chosen platform header when TRUSTED_PLATFORM_HEADER is unset", () => {
    // This is the exploit: without the deployment declaring which edge it is
    // behind, a caller who sends cf-connecting-ip must NOT get to pick their
    // own rate-limit bucket. The request must fall through to
    // x-forwarded-for, read from the right as usual.
    const identity = clientIp(
      request({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 5.6.7.8" }),
    );
    expect(identity).toMatchObject({ ok: true, ip: "5.6.7.8", source: "x-forwarded-for[-1]" });
  });

  it("rejects a TRUSTED_PLATFORM_HEADER value it does not recognise, treating it as unset", () => {
    process.env.TRUSTED_PLATFORM_HEADER = "x-attacker-header";
    const identity = clientIp(
      request({ "x-attacker-header": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 5.6.7.8" }),
    );
    expect(identity).toMatchObject({ ok: true, ip: "5.6.7.8" });
  });

  it("reads x-forwarded-for from the right, not the left", () => {
    // The caller wrote 9.9.9.9; our proxy appended 1.2.3.4. Reading the left
    // entry would let anyone choose their own rate-limit bucket.
    const identity = clientIp(request({ "x-forwarded-for": "9.9.9.9, 1.2.3.4" }));
    expect(identity).toMatchObject({ ok: true, ip: "1.2.3.4" });
  });

  it("fails closed when no header can be trusted", () => {
    expect(clientIp(request({})).ok).toBe(false);
  });

  it("allows an untrusted address only when development says so", () => {
    process.env.ALLOW_UNTRUSTED_CLIENT_IP = "true";
    expect(clientIp(request({})).ok).toBe(true);
  });
});

describe("hashIp", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_SALT = "test-salt";
  });

  it("is stable for one address and different across addresses", () => {
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });

  it("never returns the address itself", () => {
    expect(hashIp("1.2.3.4")).not.toContain("1.2.3.4");
  });

  it("changes completely when the salt changes", () => {
    const before = hashIp("1.2.3.4");
    process.env.RATE_LIMIT_SALT = "another-salt";
    expect(hashIp("1.2.3.4")).not.toBe(before);
  });
});
