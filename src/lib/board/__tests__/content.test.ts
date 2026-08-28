import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { CONTENT_LIMITS, validateContent } from "../content";
import { TARGET_STORED_BYTES, encodeAttempts, plannedEncode, type Fit } from "../image-plan";

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

// The block is part of the input now: `validateContent` refuses a `contain`
// the rectangle is too small to letterbox (see `canHonourContain` in
// image-fit.ts). It is generous here on purpose, so that every case about the
// image, the link or the caption is answering its own question rather than
// that one. The fit's own rules get their own rectangles, below.
const GOOD = {
  link: "https://example.com/",
  caption: "A caption",
  imageFit: "contain" as const,
  block: { width: 400, height: 400 },
};

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

  it("rejects http, javascript, data and an empty field", async () => {
    for (const link of [
      "http://example.com/",
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "",
    ]) {
      const result = await validateContent({ ...GOOD, link, bytes: await png(10, 10), declaredMime: "image/png" });
      expect(result.ok, `link should have been rejected: ${link}`).toBe(false);
      if (!result.ok) expect(result.rejections.some((r) => r.field === "link")).toBe(true);
    }
  });

  // A bare host used to be refused alongside those. It is not a malformed
  // address, it is an address with the obvious half left off, so link.ts puts
  // the https:// on and this stores what it produced — the same string the
  // form showed the buyer before they paid.
  it("accepts a bare domain and stores it with https:// on the front", async () => {
    const result = await validateContent({ ...GOOD, link: "adan.com/blocks", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content.link).toBe("https://adan.com/blocks");
  });

  it("refuses http as http, rather than as something it cannot parse", async () => {
    const result = await validateContent({ ...GOOD, link: "http://adan.com", bytes: await png(10, 10), declaredMime: "image/png" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections.find((r) => r.field === "link")?.code).toBe("link_not_https");
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

  /**
   * THE OPTION THAT CANNOT BE HONOURED IS NOT ACCEPTED, and the ones that can
   * are untouched. The form stops offering `contain` where the rectangle
   * cannot draw the bars, but a form is not a boundary: content is immutable
   * once paid, so a `contain` that renders as a fill would be permanent.
   */
  it("refuses a contain a 1x1 rectangle cannot letterbox, and takes the same bytes as a fill", async () => {
    // The owner's worked example: a 1x1 stores 4x4, and a picture that is not
    // square has nowhere in one pixel to put its bars.
    const bytes = await png(4, 3);
    const block = { width: 1, height: 1 };

    const contained = await validateContent({ ...GOOD, block, imageFit: "contain", bytes, declaredMime: "image/png" });
    expect(contained.ok).toBe(false);
    if (!contained.ok) {
      expect(contained.rejections.map((r) => [r.field, r.code])).toEqual([["imageFit", "fit_impossible"]]);
    }

    // Nothing else about the submission was wrong, which is the point: the
    // fit is the only thing refused, and the fill goes straight through.
    const covered = await validateContent({ ...GOOD, block, imageFit: "cover", bytes, declaredMime: "image/png" });
    expect(covered.ok).toBe(true);
    if (covered.ok) expect(covered.content.imageFit).toBe("cover");
  });

  it("leaves contain alone on a large rectangle with a wide picture", async () => {
    const result = await validateContent({
      ...GOOD,
      block: { width: 200, height: 50 },
      imageFit: "contain",
      bytes: await png(800, 100),
      declaredMime: "image/png",
    });
    expect(result.ok, "a wide picture in a large rectangle keeps its bars").toBe(true);
    if (result.ok) expect(result.content.imageFit).toBe("contain");
  });

  it("says nothing about the fit when the picture itself could not be read", async () => {
    // The shape is unknown, so the question is unanswerable — and the file
    // already has its own rejection saying why.
    const result = await validateContent({
      ...GOOD,
      block: { width: 1, height: 1 },
      imageFit: "contain",
      bytes: Buffer.from("nope"),
      declaredMime: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejections.map((r) => r.field)).toEqual(["image"]);
  });

  it("is reported alongside every other bad field, not instead of them", async () => {
    const result = await validateContent({
      bytes: Buffer.from("nope"),
      declaredMime: "image/png",
      link: "javascript:alert(1)",
      caption: "x".repeat(99),
      imageFit: "banana",
      block: { width: 400, height: 400 },
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
      block: { width: 400, height: 400 },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections.map((r) => r.field).sort()).toEqual(["caption", "image", "link"]);
    }
  });
});

/**
 * A deterministic stand-in for a phone photograph: broad gradients with fine
 * grain over them, which is exactly the content that makes a JPEG heavy. A
 * flat colour would compress to nothing and prove nothing.
 */
function photograph(width: number, height: number): Buffer {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 123_456_789;
  const next = () => ((seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      const wave = 128 + 100 * Math.sin(x / 37) * Math.cos(y / 53);
      const grain = (next() - 0.5) * 90;
      raw[i] = clamp(wave + grain);
      raw[i + 1] = clamp(255 - wave * 0.7 + grain);
      raw[i + 2] = clamp((((x + y) % 255) * 0.8) + grain);
    }
  }
  return raw;
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/**
 * What `image-encode.ts` does in a canvas, done here with `sharp`: walk the
 * rungs `encodeAttempts` hands out, draw each one exactly where
 * `plannedEncode` says, and stop at the first that lands under the target.
 *
 * This is not a mock of the browser — it is the same two pure functions the
 * browser calls, driven by a different rasterizer, so what it proves is that
 * their arithmetic yields a payload the server accepts. That the CANVAS obeys
 * them is proved separately, with a real 8 MB photograph in headless Chrome.
 */
async function encodeByPlan(source: Buffer, block: { width: number; height: number }, fit: Fit) {
  const { width = 0, height = 0 } = await sharp(source).metadata();
  let smallest: Buffer | null = null;

  for (const attempt of encodeAttempts(block)) {
    const plan = plannedEncode(width, height, block, fit, attempt.maxLongEdge);
    const encoded = await sharp(source)
      .extract({
        left: Math.round(plan.source.x),
        top: Math.round(plan.source.y),
        width: Math.floor(plan.source.width),
        height: Math.floor(plan.source.height),
      })
      .resize(plan.target.width, plan.target.height, { fit: "fill" })
      .webp({ quality: Math.round(attempt.quality * 100) })
      .toBuffer();
    if (encoded.length <= TARGET_STORED_BYTES) return { bytes: encoded, attempt, plan };
    if (!smallest || encoded.length < smallest.length) smallest = encoded;
  }
  throw new Error(`no rung of the ladder fitted; smallest was ${smallest?.length} bytes`);
}

describe("an 8 MB photograph ends in a valid block", () => {
  // The whole point of the rework: the buyer supplies a real photograph and
  // the app is what makes it fit. Nothing here asks the buyer for anything
  // smaller, and the payload that reaches validateContent is the one the
  // client built.
  it("shrinks a genuinely large JPEG until the server accepts it, at every block size", async () => {
    const raw = photograph(3300, 2500);
    const jpeg = await sharp(raw, { raw: { width: 3300, height: 2500, channels: 3 } })
      .jpeg({ quality: 98, chromaSubsampling: "4:4:4" })
      .toBuffer();
    expect(jpeg.length).toBeGreaterThan(8 * 1024 * 1024);

    for (const [block, fit] of [
      [{ width: 10, height: 10 }, "contain"],
      [{ width: 100, height: 100 }, "cover"],
      [{ width: 250, height: 250 }, "cover"],
    ] as const) {
      const { bytes } = await encodeByPlan(jpeg, block, fit);
      expect(bytes.length).toBeLessThanOrEqual(TARGET_STORED_BYTES);

      const result = await validateContent({
        ...GOOD,
        imageFit: fit,
        block,
        bytes,
        declaredMime: "image/jpeg",
      });
      expect(result.ok, `a ${block.width}x${block.height} block should have accepted the shrunk photo`).toBe(true);
      if (result.ok) {
        expect(result.content.mime).toBe("image/webp");
        expect(result.content.bytes.length).toBeLessThan(CONTENT_LIMITS.maxBytes);
      }
    }
  }, 60_000);

  it("stores a 10x10 block at 40 pixels and a 100x100 block at 400, from the same photo", async () => {
    const raw = photograph(3300, 2500);
    const jpeg = await sharp(raw, { raw: { width: 3300, height: 2500, channels: 3 } }).jpeg().toBuffer();

    const small = await encodeByPlan(jpeg, { width: 10, height: 10 }, "cover");
    const large = await encodeByPlan(jpeg, { width: 100, height: 100 }, "cover");
    expect(small.plan.target).toEqual({ width: 40, height: 40 });
    expect(large.plan.target).toEqual({ width: 400, height: 400 });

    const decodedSmall = await sharp(small.bytes).metadata();
    expect([decodedSmall.width, decodedSmall.height]).toEqual([40, 40]);
  }, 60_000);
});
