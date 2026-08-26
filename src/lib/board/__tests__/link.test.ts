import { describe, expect, it } from "vitest";
import { LINK_MAX_LENGTH, checkLink, normaliseLink } from "../link";

/**
 * The rules the form and the server both work to. Tested here rather than in
 * a component, because a component test would prove the sentence and not the
 * decision behind it.
 */

describe("normaliseLink — a bare domain is a real answer", () => {
  it("puts https:// in front of a bare domain", () => {
    expect(normaliseLink("adan.com")).toBe("https://adan.com");
  });

  it("keeps the path, the query and the fragment exactly as typed", () => {
    expect(normaliseLink("adan.com/a/b?c=d#e")).toBe("https://adan.com/a/b?c=d#e");
  });

  it("trims first, so surrounding whitespace does not become part of the host", () => {
    expect(normaliseLink("  adan.com  ")).toBe("https://adan.com");
  });

  it("leaves a link that already says https alone", () => {
    expect(normaliseLink("https://adan.com/")).toBe("https://adan.com/");
  });

  it("does not upgrade http, because a scheme that was typed was meant", () => {
    expect(normaliseLink("http://adan.com")).toBe("http://adan.com");
  });

  it("treats a protocol-relative address as a domain with the scheme left off", () => {
    expect(normaliseLink("//adan.com")).toBe("https://adan.com");
  });

  it("leaves an empty field empty rather than inventing https:// of nothing", () => {
    expect(normaliseLink("")).toBe("");
    expect(normaliseLink("   ")).toBe("");
  });

  it("tidies nothing else: no lowercasing, no trailing slash, no rewriting", () => {
    expect(normaliseLink("https://Adan.COM/Path")).toBe("https://Adan.COM/Path");
  });
});

describe("checkLink — what is refused, and why", () => {
  it("accepts a bare domain once it has been normalised", () => {
    expect(checkLink(normaliseLink("adan.com"))).toBeNull();
  });

  it("refuses http in its own right, not as a malformed address", () => {
    expect(checkLink(normaliseLink("http://adan.com"))).toBe("link_not_https");
  });

  it("refuses every other scheme the same way", () => {
    for (const link of ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "ftp://adan.com"]) {
      expect(checkLink(normaliseLink(link)), link).toBe("link_not_https");
    }
  });

  it("refuses an empty field as an address rather than as a scheme", () => {
    expect(checkLink(normaliseLink(""))).toBe("link_invalid");
  });

  it("refuses a scheme with nothing behind it", () => {
    expect(checkLink(normaliseLink("https://"))).toBe("link_invalid");
  });

  it("measures the length of what will be STORED, https:// included", () => {
    const bare = "a".repeat(LINK_MAX_LENGTH - 4) + ".com";
    expect(bare.length).toBe(LINK_MAX_LENGTH);
    expect(checkLink(normaliseLink(bare))).toBe("link_too_long");
  });

  it("accepts a normalised link at exactly the cap", () => {
    const prefix = "https://adan.com/";
    const atCap = prefix + "a".repeat(LINK_MAX_LENGTH - prefix.length);
    expect(atCap.length).toBe(LINK_MAX_LENGTH);
    expect(checkLink(normaliseLink(atCap))).toBeNull();
  });
});
