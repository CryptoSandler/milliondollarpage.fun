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

  it("trims whitespace and rejects a caption that is only whitespace", async () => {
    const spaced = await validateContent({ ...GOOD, caption: "  hello  ", bytes: await png(10, 10), declaredMime: "image/png" });
    if (spaced.ok) expect(spaced.content.caption).toBe("hello");
    const blank = await validateContent({ ...GOOD, caption: "   ", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(blank.ok).toBe(false);
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
