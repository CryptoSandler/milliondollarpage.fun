import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CONTENT_LIMITS, validateContent } from "../content";

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();
}

// NOTE: despite the tempting name, this is a SINGLE-FRAME GIF — sharp's .gif()
// encoder here produces one frame. It exists to prove that the declared MIME
// (image/png) is ignored in favor of what the bytes actually are (image/gif),
// not to exercise animation detection. A real animated-GIF fixture is
// deliberately out of scope for this task; see the task report.
async function singleFrameGif(): Promise<Buffer> {
  return sharp(
    { create: { width: 20, height: 20, channels: 3, background: { r: 0, g: 0, b: 0 } } },
  )
    .gif()
    .toBuffer();
}

const GOOD = { link: "https://example.com/", caption: "A caption", imageFit: "contain" as const };

describe("validateContent — the image", () => {
  it("accepts a small PNG and reports its shape", async () => {
    const result = await validateContent({ ...GOOD, bytes: await png(100, 100), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.mime).toBe("image/png");
      expect(result.content.width).toBe(100);
      expect(result.content.height).toBe(100);
      expect(result.content.isAnimated).toBe(false);
      expect(result.content.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("computes a hash that changes when one pixel changes", async () => {
    const a = await validateContent({ ...GOOD, bytes: await png(100, 100), declaredMime: "image/png" });
    const b = await validateContent({ ...GOOD, bytes: await png(101, 100), declaredMime: "image/png" });
    if (a.ok && b.ok) expect(a.content.sha256).not.toBe(b.content.sha256);
    else throw new Error("both fixtures should validate");
  });

  it("rejects anything over the byte cap", async () => {
    const big = Buffer.alloc(CONTENT_LIMITS.maxBytes + 1, 1);
    const result = await validateContent({ ...GOOD, bytes: big, declaredMime: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections[0].field).toBe("image");
  });

  it("rejects an image larger than the board", async () => {
    const result = await validateContent({
      ...GOOD,
      bytes: await png(CONTENT_LIMITS.maxDimension + 10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
  });

  it("trusts the bytes, not the declared type", async () => {
    // A caller claiming image/png over a GIF must not get a PNG recorded.
    const result = await validateContent({ ...GOOD, bytes: await singleFrameGif(), declaredMime: "image/png" });
    if (result.ok) expect(result.content.mime).toBe("image/gif");
    else expect(result.rejections[0].field).toBe("image");
  });

  it("rejects a file that is not an image at all", async () => {
    const result = await validateContent({
      ...GOOD,
      bytes: Buffer.from("<html><body>hello</body></html>"),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections[0].field).toBe("image");
  });

  it("rejects an empty file", async () => {
    const result = await validateContent({ ...GOOD, bytes: Buffer.alloc(0), declaredMime: "image/png" });
    expect(result.ok).toBe(false);
  });
});

describe("validateContent — the link", () => {
  it("accepts https", async () => {
    const result = await validateContent({ ...GOOD, link: "https://example.com/a/b?c=d", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
  });

  it("rejects http, javascript, data and a bare host", async () => {
    for (const link of [
      "http://example.com/",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "example.com",
      "",
    ]) {
      const result = await validateContent({ ...GOOD, link, bytes: await png(10, 10), declaredMime: "image/png" });
      expect(result.ok, `link should have been rejected: ${link}`).toBe(false);
      if (!result.ok) expect(result.rejections.some((r) => r.field === "link")).toBe(true);
    }
  });

  it("trims surrounding whitespace before validating and storing it", async () => {
    const result = await validateContent({
      ...GOOD,
      link: "  https://example.com/a  ",
      bytes: await png(10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.link).toBe("https://example.com/a");
  });

  it("rejects a link over the length cap", async () => {
    const huge = `https://example.com/${"a".repeat(CONTENT_LIMITS.linkMaxLength)}`;
    const result = await validateContent({ ...GOOD, link: huge, bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections.some((r) => r.field === "link")).toBe(true);
  });

  it("accepts a link at exactly the length cap", async () => {
    const prefix = "https://example.com/";
    const atCap = `${prefix}${"a".repeat(CONTENT_LIMITS.linkMaxLength - prefix.length)}`;
    expect(atCap.length).toBe(CONTENT_LIMITS.linkMaxLength);
    const result = await validateContent({ ...GOOD, link: atCap, bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
  });
});

describe("validateContent — the caption", () => {
  it("accepts a caption at the cap", async () => {
    const result = await validateContent({
      ...GOOD,
      caption: "x".repeat(CONTENT_LIMITS.captionMaxLength),
      bytes: await png(10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects one character over", async () => {
    const result = await validateContent({
      ...GOOD,
      caption: "x".repeat(CONTENT_LIMITS.captionMaxLength + 1),
      bytes: await png(10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
  });

  // INVERTED, deliberately. This test used to assert that a whitespace-only
  // caption was rejected. The caption is optional now, by the owner's
  // decision, so the same input is accepted and stored as NULL — and the
  // assertion is turned round rather than deleted, so the reversal is
  // visible in the history instead of silently absent from it.
  it("trims whitespace, and treats a whitespace-only caption as no caption at all", async () => {
    const spaced = await validateContent({ ...GOOD, caption: "  hello  ", bytes: await png(10, 10), declaredMime: "image/png" });
    if (spaced.ok) expect(spaced.content.caption).toBe("hello");
    const blank = await validateContent({ ...GOOD, caption: "   ", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.content.caption).toBeNull();
  });

  it("accepts an empty caption and stores NULL, never an empty string", async () => {
    const result = await validateContent({ ...GOOD, caption: "", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.caption).toBeNull();
  });

  it("still holds a caption that is present to the 32-character cap", async () => {
    const result = await validateContent({
      ...GOOD,
      caption: "x".repeat(CONTENT_LIMITS.captionMaxLength + 1),
      bytes: await png(10, 10),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections.some((r) => r.field === "caption")).toBe(true);
  });
});

describe("validateContent — the image fit", () => {
  it("accepts contain and cover", async () => {
    for (const imageFit of ["contain", "cover"] as const) {
      const result = await validateContent({ ...GOOD, imageFit, bytes: await png(10, 10), declaredMime: "image/png" });
      expect(result.ok, `imageFit should have been accepted: ${imageFit}`).toBe(true);
      if (result.ok) expect(result.content.imageFit).toBe(imageFit);
    }
  });

  it("rejects anything else, including the empty string", async () => {
    for (const imageFit of ["banana", "COVER", "fill", ""]) {
      const result = await validateContent({ ...GOOD, imageFit, bytes: await png(10, 10), declaredMime: "image/png" });
      expect(result.ok, `imageFit should have been rejected: ${imageFit}`).toBe(false);
      if (!result.ok) expect(result.rejections.some((r) => r.field === "imageFit")).toBe(true);
    }
  });

  it("is reported alongside every other bad field, not instead of them", async () => {
    const result = await validateContent({
      bytes: Buffer.from("nope"),
      declaredMime: "image/png",
      link: "javascript:alert(1)",
      caption: "x".repeat(99),
      imageFit: "banana",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections.map((r) => r.field).sort()).toEqual([
        "caption",
        "image",
        "imageFit",
        "link",
      ]);
    }
  });
});

describe("validateContent — reporting", () => {
  it("reports every bad field at once, not just the first", async () => {
    const result = await validateContent({
      bytes: Buffer.from("nope"),
      declaredMime: "image/png",
      link: "javascript:alert(1)",
      caption: "x".repeat(99),
      imageFit: "contain",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections.map((r) => r.field).sort()).toEqual(["caption", "image", "link"]);
    }
  });
});
