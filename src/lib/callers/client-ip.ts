import { createHash } from "node:crypto";
import {
  allowUntrustedClientIp,
  rateLimitSalt,
  trustedPlatformHeader,
  trustedProxyHops,
} from "../config";

/**
 * Caller identity, protecting reservation creation.
 *
 * Creating a hold is free and takes a rectangle off the board for half an
 * hour, which makes it the cheapest thing on this site to abuse. Everything
 * here exists to answer one question honestly: who is asking, so that
 * `checkReservationLimits` has something trustworthy to count against.
 */

/** Raw IPs are never stored. This is only ever used as a counting key. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${rateLimitSalt()}:${normaliseIp(ip)}`).digest("hex");
}

/**
 * One canonical spelling for one address.
 *
 * A dual-stack listener reports IPv4 clients as `::ffff:a.b.c.d`. `hashIp`
 * must agree with itself about who that is — two spellings for the same
 * visitor means two buckets, and that means the limit quietly halves itself.
 */
export function normaliseIp(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip.trim());
  return mapped ? mapped[1] : ip.trim().toLowerCase();
}

/**
 * Headers a platform CAN set itself, overwriting whatever a caller sent —
 * but only on the platform that actually does the overwriting. None of these
 * are unforgeable in general: sent to a deployment not behind that platform's
 * edge, they are ordinary inbound headers a caller can set to anything,
 * including someone else's rate-limit bucket. That is why `clientIp` below
 * trusts at most one of them, and only the one named by
 * `TRUSTED_PLATFORM_HEADER` — this list exists so a typo in that variable
 * cannot promote an arbitrary header to authoritative.
 */
const PLATFORM_IP_HEADERS = [
  "cf-connecting-ip",
  "true-client-ip",
  "x-vercel-forwarded-for",
  "fly-client-ip",
] as const;

export type ClientIdentity =
  | { ok: true; ip: string; source: string }
  | { ok: false; reason: string };

/**
 * Caller identity, read from the right of x-forwarded-for rather than the left.
 *
 * Proxies APPEND to that header, so the left-most entry is whatever the caller
 * sent — reading it let anyone pick their own rate-limit bucket with a forged
 * header. The trustworthy entry is the one our own proxy appended, counted from
 * the right by how many hops sit in front of us.
 *
 * Fails closed. If no header can be trusted we return an error rather than a
 * shared bucket: a shared bucket for every anonymous caller is either an
 * unlimited allowance or a self-inflicted outage, and neither is a limit.
 */
export function clientIp(request: Request): ClientIdentity {
  const platformHeader = trustedPlatformHeader();
  if (platformHeader && (PLATFORM_IP_HEADERS as readonly string[]).includes(platformHeader)) {
    const value = request.headers.get(platformHeader)?.split(",")[0]?.trim();
    if (value) return { ok: true, ip: value, source: platformHeader };
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = trustedProxyHops();
    const entries = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    // With one proxy in front, entries[len-1] is what that proxy appended: the
    // address it actually saw. Anything further left the caller could have
    // written. Too few entries means the header did not come through our proxy.
    const index = entries.length - hops;
    if (index >= 0 && entries[index]) {
      return { ok: true, ip: entries[index], source: `x-forwarded-for[-${hops}]` };
    }
    return {
      ok: false,
      reason: `x-forwarded-for has ${entries.length} entries but ${hops} trusted proxies are configured.`,
    };
  }

  if (allowUntrustedClientIp()) {
    return { ok: true, ip: "untrusted-local", source: "development" };
  }

  return {
    ok: false,
    reason:
      "No trusted client address. Set TRUSTED_PROXY_HOPS to match the deployment, or ALLOW_UNTRUSTED_CLIENT_IP=true for local development.",
  };
}
