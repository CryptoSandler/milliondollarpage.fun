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
