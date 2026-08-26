import type { ContentRejection, RejectionCode } from "./content";
import type { ImageProblem } from "./image-encode";
import type { LinkProblem } from "./link";

/**
 * Every sentence the upload step can put on screen, and the one place that
 * decides which one it is.
 *
 * THIS REVERSES AN EARLIER CONTRACT, deliberately. `problem()` on the server
 * promised a message safe to render as-is, and the dialog rendered it. That
 * is how the buyer ended up looking at "The request body must not exceed
 * 110592 bytes." — true, useless, and written for whoever was reading the
 * response with curl. The server's sentence is now for a developer and a log;
 * the buyer gets one WE wrote for this screen.
 *
 * So the rule this module exists to keep: NO HTTP STATUS AND NO SERVER TEXT
 * EVER REACHES THE SCREEN. Nothing here interpolates `message`, `reason` or a
 * status into what it returns, and a test walks every status the routes can
 * answer with to prove it.
 *
 * It is pure — a status and an array in, sentences out — because "which of
 * these thirty sentences" is exactly the kind of decision that rots quietly
 * inside a component nobody can test.
 */

export type UploadField = "image" | "link" | "caption" | "imageFit";

/**
 * Everything the BROWSER can refuse on its own, before a byte is sent.
 *
 * Two fields can produce one: the picture, and the link. Both are checked here
 * rather than a round trip later, because a sentence that arrives the moment
 * the buyer presses Continue is worth more than the identical sentence a
 * second afterwards — and because the link's rules are pure (see link.ts) and
 * the browser has every one of them.
 */
export type LocalProblem = ImageProblem | LinkProblem;

/** Which field each local refusal belongs beside. */
const LOCAL_FIELD: Record<LocalProblem, UploadField> = {
  image_input_too_large: "image",
  image_unreadable: "image",
  image_unencodable: "image",
  link_too_long: "link",
  link_not_https: "link",
  link_invalid: "link",
};

export type UploadOutcome =
  /** The ceiling fired: no answer came back at all. */
  | { kind: "timeout" }
  /** The browser refused the file or the link before sending either. */
  | { kind: "local"; problem: LocalProblem }
  /** The server answered, and did not like it. */
  | { kind: "failure"; status: number; rejections?: ContentRejection[]; retryAt?: string };

export type UploadMessages = {
  /** One sentence per bad field, shown beside that field. Every bad field at once. */
  fields: Partial<Record<UploadField, string>>;
  /** At most one sentence about the request as a whole. */
  form: string | null;
  /** Nothing left for this dialog to do: the hold is gone, not ours, or already paid. */
  fatal: boolean;
  /** No answer came back. Styled as a wait, not as a refusal, and carries a retry. */
  stalled: boolean;
};

/** Nothing is wrong: the state the form starts in and returns to on every edit. */
export const NO_UPLOAD_MESSAGES: UploadMessages = { fields: {}, form: null, fatal: false, stalled: false };

/**
 * What the screen says when the upload has run past `STEP_CEILING_MS`.
 *
 * Says what happened, what is genuinely unknown, and what pressing the button
 * will do about it. Re-asking is always safe here: attaching content
 * overwrites whatever is on a still-reserved order, so the attempt that timed
 * out either never arrived or already stored these very bytes.
 */
export const UPLOAD_STALLED_MESSAGE =
  "Ten seconds, and the server has not said whether your image and link made it. Ask again: if " +
  "they already landed, this finds them already there and carries you straight to the next step, " +
  "and if they did not, this sends them once more. Either way these pixels stay held until the " +
  "clock above runs out.";

/** One sentence per thing that can actually be wrong with a field. */
const FIELD_SENTENCES: Record<RejectionCode | ImageProblem, string> = {
  image_empty: "That file has nothing in it. Pick the image again.",
  image_too_heavy: "That image is still too heavy to store. Try a different picture.",
  image_unreadable: "We could not open that file as a picture. Try a JPEG, PNG, WebP or GIF.",
  image_wrong_type: "That kind of file cannot go on the board. Try a JPEG, PNG, WebP or GIF.",
  image_too_large: "That picture is larger than the whole board. Try a smaller one.",
  image_input_too_large: "That file is over 10 MB. Pick a lighter one — the shrinking is our job, but ten megabytes is where we stop.",
  image_unencodable: "We could not shrink that picture down to your block. Try a different one.",
  link_too_long: "That link is too long. Use a shorter address.",
  link_not_https:
    "A block can only send people somewhere over https. Change the front of that address to " +
    "https:// and it will go through.",
  link_invalid:
    "That is not a web address. Something like yourproject.xyz will do — we put the https:// on " +
    "the front for you.",
  caption_too_long: "The caption has to be 32 characters or fewer.",
  fit_unknown: "Choose how the picture should fill the rectangle.",
};

/** Used when a field is refused for a reason this build has never heard of. */
const FIELD_FALLBACK: Record<UploadField, string> = {
  image: "That picture cannot be used. Try a different one.",
  link: "That link cannot be used. Try another address.",
  caption: "That caption cannot be used. Try a shorter one.",
  imageFit: "Choose how the picture should fill the rectangle.",
};

const NO_ANSWER =
  "We could not reach the server. Check your connection, then press Continue again.";
const MALFORMED =
  "That did not arrive in one piece. Press Continue to send it again.";
const NOT_YOURS =
  "These pixels are held for a different wallet address, so they cannot be filled in from here.";
const GONE =
  "This hold is not on the board any more. Nothing was charged — close this and pick your pixels again.";
const ALREADY_PAID =
  "These pixels are already paid for, and what is in a paid block cannot be changed.";
const EXPIRED =
  "The thirty minutes ran out, so the hold ended and these pixels went back on the board. Nothing was charged.";
const TOO_HEAVY_TO_SEND =
  "That picture was too heavy to send. Pick it again and we will shrink it further.";
const NOTHING_ACCEPTED =
  "Something in this form could not be accepted. Check the fields above and press Continue again.";
const TOO_MANY =
  "That is a lot of uploads in a short time. Wait a moment, then press Continue again.";
const OUR_FAULT =
  "Something went wrong on our side. Press Continue to try again.";

/**
 * Turns one upload outcome into the sentences on screen.
 *
 * Every field that is wrong is named at once — a form that reports one bad
 * field at a time makes a buyer submit repeatedly to discover the rest — and
 * at most one sentence is ever said about the request as a whole.
 */
export function describeUpload(outcome: UploadOutcome): UploadMessages {
  if (outcome.kind === "timeout") {
    return { fields: {}, form: UPLOAD_STALLED_MESSAGE, fatal: false, stalled: true };
  }

  if (outcome.kind === "local") {
    return {
      fields: { [LOCAL_FIELD[outcome.problem]]: FIELD_SENTENCES[outcome.problem] },
      form: null,
      fatal: false,
      stalled: false,
    };
  }

  const { status, rejections, retryAt } = outcome;

  if (status === 422) {
    const fields: Partial<Record<UploadField, string>> = {};
    for (const rejection of rejections ?? []) {
      fields[rejection.field] = FIELD_SENTENCES[rejection.code] ?? FIELD_FALLBACK[rejection.field];
    }
    const named = Object.keys(fields).length > 0;
    return { fields, form: named ? null : NOTHING_ACCEPTED, fatal: false, stalled: false };
  }

  // A body the request-level gate refused. It is about the image and nothing
  // else, so it is said beside the image rather than over the whole form —
  // and it is said in bytes nobody has to count.
  if (status === 413) {
    return { fields: { image: TOO_HEAVY_TO_SEND }, form: null, fatal: false, stalled: false };
  }

  // The four the form cannot fix by trying again: the hold is somebody
  // else's, gone, expired, or already paid. Each of those ends the purchase
  // rather than the submission, so the dialog takes over the screen.
  const fatalForm = FATAL_STATUSES[status];
  if (fatalForm) return { fields: {}, form: fatalForm, fatal: true, stalled: false };

  if (status === 429) {
    return { fields: {}, form: TOO_MANY + retryAtSuffix(retryAt), fatal: false, stalled: false };
  }

  if (status === 0) return { fields: {}, form: NO_ANSWER, fatal: false, stalled: false };
  if (status === 400) return { fields: {}, form: MALFORMED, fatal: false, stalled: false };
  return { fields: {}, form: OUR_FAULT, fatal: false, stalled: false };
}

const FATAL_STATUSES: Record<number, string | undefined> = {
  403: NOT_YOURS,
  404: GONE,
  409: ALREADY_PAID,
  410: EXPIRED,
};

/**
 * " You can try again after 4:05 PM." — our sentence around the one thing on
 * a 429 body worth repeating, which is a moment in time rather than a number
 * of seconds a buyer would have to count down themselves.
 */
function retryAtSuffix(retryAt: string | undefined): string {
  if (!retryAt) return "";
  const at = Date.parse(retryAt);
  if (Number.isNaN(at)) return "";
  const clock = new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return ` You can try again after ${clock}.`;
}
