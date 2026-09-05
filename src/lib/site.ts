/**
 * The one origin this site is served from.
 *
 * WHO CALLS THIS: `src/app/layout.tsx`, for the `metadataBase` a relative
 * `og:image` is resolved against, and `src/app/b/[id]/page.tsx`, for the embed
 * snippet a buyer pastes on their own page. Both need an ABSOLUTE URL and
 * neither may disagree with the other about what it is.
 *
 * HARD-CODED RATHER THAN READ FROM THE ENVIRONMENT, which is the opposite of
 * what `config.ts` does with everything else and is right here for one reason:
 * a missing variable there throws, and a missing variable here would silently
 * produce `http://localhost:3000` in a card crawlers fetch and in a snippet
 * somebody pastes. This site has one production origin and it is in the
 * repository's name.
 *
 * A PREVIEW DEPLOYMENT THEREFORE ADVERTISES PRODUCTION, which is correct: a
 * preview's badge is not a thing anybody should be pasting anywhere.
 */
export const SITE_ORIGIN = "https://milliondollarpage.fun";

/** A path on this site, as the absolute URL somebody else's page needs. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}

/**
 * The one address a reader can write to.
 *
 * WHO CALLS THIS: `src/components/SiteFooter.tsx`, which prints it at the foot
 * of every page that carries prose, and `src/app/faq/page.tsx`, which answers
 * "how do I get in touch" with it. Two places, one string — an address that
 * disagreed with itself across two pages is an address half the mail goes
 * nowhere from.
 *
 * IT IS A `mailto:` LINK, AS OF 2026-09-05, and it was deliberately not one
 * before that. The reasoning is kept rather than deleted, because the reason it
 * was text is the reason it may have to become text again: a `mailto:` on an
 * address that bounces is worse than no link at all — it invites a reader to
 * spend a message that silently fails, and they never learn it failed. Text
 * invites them to copy it, and a copied address that bounces bounces visibly.
 *
 * So the link is a claim that the mailbox receives. If it ever stops, the honest
 * change is back to a `<span>`, in the three files that print it — the footer,
 * the FAQ (twice) and `/press` — and `contact.test.tsx` counts them.
 *
 * ponytail: forwarding is the cheaper arrangement — Namecheap forwards the
 * domain's mail to an existing inbox for nothing, and Private Email is the
 * upgrade when a reply needs to come FROM this address rather than land in it.
 */
export const CONTACT_EMAIL = "contact@milliondollarpage.fun";
