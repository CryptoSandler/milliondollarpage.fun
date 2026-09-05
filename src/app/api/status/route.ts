import { NO_STORE, json } from "../../../lib/http";
import { EXPECTED_MIGRATION } from "../../../lib/schema-version";
import { robinhoodRailEnabled } from "../../../lib/payments/usdg";

/**
 * Which ways of paying are open right now, said out loud.
 *
 * WHO CALLS THIS: a person, and eventually the operator's own checks. Nothing
 * in the interface reads it yet, which is stated rather than hidden — the owner
 * asked for it as the ANSWER TO A QUESTION that until now had no answer except
 * reading Vercel's environment page: is the Robinhood rail on, and if not, why
 * not. A deploy that turned it on and a deploy that thought it had are
 * indistinguishable without this.
 *
 * ## What it may say, and what it may never say
 *
 * It reports STATE, never VALUES. Whether a treasury is set, never which
 * address; that the rail is off, never which node it would have used. Every
 * fact here is one a buyer could establish by trying to buy a rectangle and
 * reading the refusal, which is the line this route is not allowed to cross:
 * a status page is the classic place a deployment quietly publishes its own
 * configuration.
 *
 * The schema version is here because it is the other thing that goes wrong
 * silently — a build serving a database that is behind — and it is a constant
 * that already travels in the JavaScript. It names a migration, not a database.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const enabled = robinhoodRailEnabled();
  const treasury = Boolean(process.env.ROBINHOOD_TREASURY_ADDRESS?.trim());

  return json(
    {
      rails: {
        /*
          A SENTENCE AS WELL AS TWO BOOLEANS, deliberately. The booleans are for
          whatever reads this; the sentence is what a person sees when they open
          the URL, and "off" without "why" is the answer that sends somebody to
          the environment page anyway.
        */
        robinhood: {
          enabled,
          treasury,
          state: railState(enabled, treasury),
        },
        // No Solana rail exists yet. Saying so is the honest answer; leaving it
        // out would read as an oversight rather than as a fact.
        solana: { enabled: false, treasury: false, state: "off, not built" },
      },
      schema: EXPECTED_MIGRATION,
    },
    { headers: NO_STORE },
  );
}

function railState(enabled: boolean, treasury: boolean): string {
  if (enabled && treasury) return "on";
  // The unreachable one, and it says so rather than lying: the boot guard
  // refuses to start this combination, so an instance answering this is an
  // instance whose environment changed under a process that was already up.
  if (enabled) return "on by flag, no treasury — this instance should not have started";
  return treasury ? "off by flag" : "off by flag, no treasury";
}
