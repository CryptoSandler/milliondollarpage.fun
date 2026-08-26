import { describe, expect, it } from "vitest";
import type { ContentRejection } from "../content";
import { UPLOAD_STALLED_MESSAGE, describeUpload } from "../upload-errors";

/**
 * The contract this file exists to pin: whatever the server answers, the
 * buyer reads a sentence WE wrote. No status code, no server text, no byte
 * count they would have to convert themselves.
 */

const rejection = (field: ContentRejection["field"], code: ContentRejection["code"]): ContentRejection => ({
  field,
  code,
  // Deliberately the kind of sentence the server really sends: every test
  // below proves it does not reach the screen.
  reason: "The image must be 102400 bytes or smaller.",
});

/** Every status the four order routes can answer with, plus the two non-answers. */
const EVERY_STATUS = [0, 400, 403, 404, 409, 410, 413, 422, 429, 500];

describe("describeUpload — the field sentences", () => {
  it("names every bad field at once, beside that field", () => {
    const messages = describeUpload({
      kind: "failure",
      status: 422,
      rejections: [
        rejection("link", "link_not_https"),
        rejection("caption", "caption_too_long"),
        rejection("image", "image_wrong_type"),
      ],
    });
    expect(Object.keys(messages.fields).sort()).toEqual(["caption", "image", "link"]);
    expect(messages.form).toBeNull();
  });

  it("says what is actually wrong with the link, in plain words", () => {
    const https = describeUpload({ kind: "failure", status: 422, rejections: [rejection("link", "link_not_https")] });
    expect(https.fields.link).toBe("The link has to start with https.");

    const invalid = describeUpload({ kind: "failure", status: 422, rejections: [rejection("link", "link_invalid")] });
    expect(invalid.fields.link).toContain("https://yourproject.xyz");
    expect(invalid.fields.link).not.toBe(https.fields.link);
  });

  it("gives a different sentence to each way an image can be refused", () => {
    const codes = ["image_empty", "image_unreadable", "image_wrong_type", "image_too_large"] as const;
    const said = codes.map((code) => describeUpload({
      kind: "failure",
      status: 422,
      rejections: [rejection("image", code)],
    }).fields.image);
    expect(new Set(said).size).toBe(codes.length);
  });

  it("falls back to a field-level sentence for a code this build has never heard of", () => {
    const messages = describeUpload({
      kind: "failure",
      status: 422,
      // A newer server rejecting for a reason this client predates.
      rejections: [{ field: "link", code: "link_from_the_future" as ContentRejection["code"], reason: "nope" }],
    });
    expect(messages.fields.link).toBe("That link cannot be used. Try another address.");
  });

  it("says something, rather than nothing, when a 422 names no field at all", () => {
    const messages = describeUpload({ kind: "failure", status: 422, rejections: [] });
    expect(messages.fields).toEqual({});
    expect(messages.form).toContain("could not be accepted");
  });
});

describe("describeUpload — every status the routes can return", () => {
  it("400 asks for the form to be sent again, and blames nothing on the buyer", () => {
    const messages = describeUpload({ kind: "failure", status: 400 });
    expect(messages.form).toContain("Press Continue");
    expect(messages.fatal).toBe(false);
  });

  it("403, 404, 409 and 410 end the purchase rather than the submission", () => {
    for (const status of [403, 404, 409, 410]) {
      const messages = describeUpload({ kind: "failure", status });
      expect(messages.fatal, `status ${status} should be fatal`).toBe(true);
      expect(messages.form).toBeTruthy();
      expect(messages.fields).toEqual({});
    }
  });

  it("gives each of those four its own sentence, because they are four different situations", () => {
    const said = [403, 404, 409, 410].map((status) => describeUpload({ kind: "failure", status }).form);
    expect(new Set(said).size).toBe(4);
  });

  it("says 410 as a hold that ran out and a card that was never charged", () => {
    const messages = describeUpload({ kind: "failure", status: 410 });
    expect(messages.form).toContain("thirty minutes");
    expect(messages.form).toContain("Nothing was charged");
  });

  // THE BUG THE OWNER SAW. A raw 413 body reached the screen as "The request
  // body must not exceed 110592 bytes." Now it is one sentence beside the
  // image, with no number in it at all.
  it("turns a 413 into a sentence about the picture, beside the picture", () => {
    const messages = describeUpload({ kind: "failure", status: 413 });
    expect(messages.fields.image).toBe("That picture was too heavy to send. Pick it again and we will shrink it further.");
    expect(messages.form).toBeNull();
    expect(messages.fatal).toBe(false);
  });

  it("429 says to wait, and says until when in a time rather than in seconds", () => {
    const messages = describeUpload({
      kind: "failure",
      status: 429,
      retryAt: new Date("2026-08-26T16:05:11.000Z").toISOString(),
    });
    expect(messages.form).toContain("Wait a moment");
    expect(messages.form).toContain("You can try again after");
    expect(messages.form).not.toContain("429");
  });

  it("429 without a retryAt says the same thing, minus the clock", () => {
    const messages = describeUpload({ kind: "failure", status: 429 });
    expect(messages.form).toContain("Wait a moment");
    expect(messages.form).not.toContain("try again after");
  });

  it("ignores a retryAt that is not a date at all", () => {
    const messages = describeUpload({ kind: "failure", status: 429, retryAt: "soon-ish" });
    expect(messages.form).not.toContain("try again after");
  });

  it("a network failure reads as a network failure, not as a refusal", () => {
    expect(describeUpload({ kind: "failure", status: 0 }).form).toContain("Check your connection");
  });

  it("anything unexpected takes the blame on our side", () => {
    for (const status of [500, 502, 418]) {
      expect(describeUpload({ kind: "failure", status }).form).toContain("on our side");
    }
  });
});

describe("describeUpload — the timeout", () => {
  it("is a wait, not a refusal, and carries the sentence that offers a retry", () => {
    const messages = describeUpload({ kind: "timeout" });
    expect(messages.stalled).toBe(true);
    expect(messages.fatal).toBe(false);
    expect(messages.fields).toEqual({});
    expect(messages.form).toBe(UPLOAD_STALLED_MESSAGE);
  });

  it("promises that asking again cannot make things worse", () => {
    expect(UPLOAD_STALLED_MESSAGE).toContain("Ask again");
    expect(UPLOAD_STALLED_MESSAGE).toContain("stay held");
  });
});

describe("describeUpload — what the browser refused before sending", () => {
  it("says ten megabytes is where we stop, not that the picture is wrong", () => {
    const messages = describeUpload({ kind: "local", problem: "image_input_too_large" });
    expect(messages.fields.image).toContain("10 MB");
    expect(messages.form).toBeNull();
  });

  it("separates a file we cannot open from one we cannot shrink", () => {
    const unreadable = describeUpload({ kind: "local", problem: "image_unreadable" }).fields.image;
    const unencodable = describeUpload({ kind: "local", problem: "image_unencodable" }).fields.image;
    expect(unreadable).not.toBe(unencodable);
  });
});

describe("no status code and no server text ever reaches the screen", () => {
  it("holds for every status, with and without rejections", () => {
    const withRejections = [rejection("image", "image_too_heavy"), rejection("link", "link_invalid")];
    for (const status of EVERY_STATUS) {
      for (const rejections of [undefined, withRejections]) {
        const messages = describeUpload({ kind: "failure", status, rejections, retryAt: "2026-08-26T16:05:11.000Z" });
        const said = [...Object.values(messages.fields), messages.form ?? ""].join(" ");
        expect(said, `status ${status}`).not.toContain(String(status));
        expect(said, `status ${status}`).not.toContain("102400");
        expect(said, `status ${status}`).not.toContain("must not exceed");
        expect(said, `status ${status}`).not.toMatch(/\bHTTP\b|\bstatus\b|\bbytes\b/i);
      }
    }
  });

  it("says something for every status, so nothing ever fails silently", () => {
    for (const status of EVERY_STATUS) {
      const messages = describeUpload({ kind: "failure", status, rejections: [rejection("image", "image_empty")] });
      const said = [...Object.values(messages.fields), messages.form ?? ""].filter(Boolean);
      expect(said.length, `status ${status} said nothing`).toBeGreaterThan(0);
    }
  });

  it("ends every sentence it produces like a sentence", () => {
    for (const status of EVERY_STATUS) {
      const messages = describeUpload({
        kind: "failure",
        status,
        rejections: [rejection("image", "image_empty"), rejection("caption", "caption_too_long")],
      });
      for (const said of [...Object.values(messages.fields), messages.form].filter(Boolean)) {
        expect(said, `status ${status}: ${said}`).toMatch(/[.]$/);
      }
    }
  });
});
