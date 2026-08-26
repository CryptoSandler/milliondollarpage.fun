/**
 * What counts as a link on a block, and the one place that decides it.
 *
 * Pure, and deliberately free of `sharp` — unlike `content.ts`, which imports
 * a native addon and can therefore never be loaded in a browser. That is the
 * whole reason this is its own module: the FORM and the SERVER have to agree
 * about what a buyer typed, down to the exact string that gets stored, and a
 * second copy of these rules inside a component is a second copy to forget to
 * change. `content.ts` calls it on the way in; `ContentForm.tsx` calls it
 * before it sends, so the address on the confirmation screen is the address
 * that will be stored.
 *
 * THE ONE JUDGEMENT CALL HERE: a bare domain gets `https://` put in front of
 * it. `adan.com` is what people type, it is unambiguous, and refusing it
 * teaches a buyer nothing except that this form is fussy. `http://adan.com` is
 * NOT the same case — a scheme that was typed out is a scheme that was meant,
 * and quietly upgrading it would be us deciding something the buyer said. So
 * that one is refused, beside the field, in a sentence that says how to fix it.
 */

/** The conventional practical URL limit; `CONTENT_LIMITS.linkMaxLength` is this. */
export const LINK_MAX_LENGTH = 2048;

/** Why a link cannot be used. The same three codes `content.ts` reports. */
export type LinkProblem = "link_too_long" | "link_not_https" | "link_invalid";

// A scheme, per RFC 3986: a letter, then letters, digits, +, - or . up to the
// colon. Anything matching this was written deliberately and is left alone.
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/**
 * The address as it will be stored: trimmed, and given `https://` if the buyer
 * left the scheme off.
 *
 * Nothing else is rewritten. It does not lowercase, strip a trailing slash, or
 * touch the path — a link is somebody's address, not ours to tidy. A
 * protocol-relative `//example.com` counts as having left the scheme off, since
 * that is exactly what it is.
 */
export function normaliseLink(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return trimmed;
  if (HAS_SCHEME.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/**
 * What is wrong with a NORMALISED link, or null when nothing is.
 *
 * Always call it on the output of `normaliseLink`; on a raw string it would
 * refuse the bare domain that normalising exists to accept. Length is checked
 * first and before parsing, the same way an oversized image is refused before
 * it is decoded.
 */
export function checkLink(link: string): LinkProblem | null {
  if (link.length > LINK_MAX_LENGTH) return "link_too_long";

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return "link_invalid";
  }

  // A URL with no host parses fine and goes nowhere: `https://` on its own,
  // and every `mailto:`/`tel:` that survived the scheme check below.
  if (url.protocol !== "https:") return "link_not_https";
  if (url.hostname === "") return "link_invalid";
  return null;
}
