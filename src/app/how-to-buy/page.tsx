import type { Metadata } from "next";
import Link from "next/link";
import ThemeToggle from "../../components/ThemeToggle";
import SiteFooter from "../../components/SiteFooter";

export const dynamic = "force-static";

/**
 * How to buy, for somebody who has never held a wallet.
 *
 * WHO LINKS HERE: the strip along the bottom of the board ("First time? →"),
 * the header, and `/faq`. Three doors, because the three readers are different:
 * one is looking at the wall and cannot buy yet, one is browsing, one has just
 * read what this is.
 *
 * ## Zero client JavaScript, the same as `/faq`
 *
 * Every illustration on this page is an inline SVG this repository draws from
 * its own tokens. Nothing is fetched, nothing animates, and the only client
 * component is the theme switch every page shares — so this route adds nothing
 * to the board's bundle, which is the claim `scripts/bundle-guard.mts` measures.
 *
 * ## The copy is anchored to `DECISIONS.md`, and one door is easy to walk
 * through here
 *
 * A page that teaches somebody to buy is a page that wants to say what they get
 * to DO with it afterwards. Whether a rectangle can ever change hands is open —
 * "not to be answered by anything shipped" — so nothing here says sell, resell,
 * transfer, or their opposites. `copy-doors.test.tsx` runs the same list over
 * this route as over the other three.
 *
 * ## No amount is quoted for the on-ramp
 *
 * `DECISIONS.md`, "the on-ramp is a link, not an integration": Ramp's fees and
 * minimums are theirs, they are published on their own site, and they change.
 * A number copied here is a number that goes stale silently, so the page says
 * a fee exists, says who charges it, and links to the page that has it.
 */

export const metadata: Metadata = {
  title: "How to buy · milliondollarpage.fun",
  description:
    "Three steps, from no wallet at all to a rectangle of the wall that is yours: install Phantom, put some SOL and USDC in it, then choose your pixels and sign.",
};

export default function HowToBuyPage() {
  return (
    <main className="prose-page">
      <div className="mx-auto max-w-[44rem] px-5 pb-24 pt-6">
        <nav className="flex items-center justify-between gap-4 border-b border-hairline-strong pb-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-[17px] font-bold text-ink"
          >
            <span aria-hidden className="size-2.5 rounded-full bg-ink" />
            milliondollarpage.fun
          </Link>
          <span className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/" className="btn-quiet px-3 py-1.5 text-[13px]">
              Back to the board
            </Link>
          </span>
        </nav>

        <h1 className="mt-10 font-display text-[34px] font-bold leading-tight tracking-tight">
          How to buy, from nothing
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-body">
          Three steps. If you have never used a crypto wallet, the first two are the whole of the
          unfamiliar part and they take about ten minutes between them. The third is drawing a
          rectangle.
        </p>

        <Step
          number={1}
          title="Install Phantom"
          illustration={<WalletDrawing />}
          lead="A wallet is an app that holds your money and signs for you. Phantom is the one most of Solana uses; Solflare and Backpack work here too."
        >
          <p>
            <strong className="font-semibold text-ink">On a computer</strong>, install the Phantom
            browser extension from{" "}
            <Out href="https://phantom.app/download">phantom.app/download</Out>. Create a new
            wallet. It shows you a recovery phrase of twelve words — write it down on paper and keep
            it somewhere you would keep a passport.{" "}
            <strong className="font-semibold text-ink">
              Nobody can recover it for you, including us.
            </strong>{" "}
            Anyone who has those words has your money.
          </p>
          <p>
            <strong className="font-semibold text-ink">On a phone</strong>, install the Phantom app
            from your app store, and then{" "}
            <strong className="font-semibold text-ink">open this site inside Phantom</strong> — the
            app has a browser of its own, and that is the way in on a phone. A wallet app cannot
            reach into Safari or Chrome to sign for you, so a page opened in those has nothing to
            talk to. The Connect button at the top of the board takes you there in one tap if you
            press it without a wallet installed.
          </p>
        </Step>

        <Step
          number={2}
          title="Put some money in it"
          illustration={<FundingDrawing />}
          lead="You need two things in the wallet: USDC to pay for pixels, and a very small amount of SOL to pay the network's fee for the transaction itself."
        >
          <p>
            <strong className="font-semibold text-ink">If you already use an exchange</strong> —
            Binance, Coinbase, Kraken, a local one — this is the cheapest route: withdraw USDC to
            your Phantom address, and choose <em>Solana</em> as the network. Withdrawing on the
            wrong network is the one mistake that loses the money, so check that word before you
            confirm. Send a little SOL the same way, or Phantom will offer to swap some for you.
          </p>
          <p>
            <strong className="font-semibold text-ink">If you do not</strong>, you can buy with a
            card or a bank transfer through <Out href="https://ramp.network/buy">Ramp Network</Out>,
            which is not us: you buy from them and it arrives in your wallet. They charge their own
            fee, and it depends on how you pay — card costs more than a bank transfer.{" "}
            <Out href="https://support.ramp.network/en/articles/10415-what-fees-are-charged-when-buying-crypto">
              Their fee schedule is published here
            </Out>
            , and it is the number to read rather than any number we could copy, because theirs
            changes and a copy would go quietly stale.
          </p>
          <p className="text-[14px] text-body">
            Two things worth knowing before you start:{" "}
            <strong className="font-semibold text-ink">
              Argentina and Chile have no local-currency route
            </strong>{" "}
            at Ramp, so a card issued there may be refused; and every on-ramp asks for
            identification, because they are moving real money. An exchange you already have an
            account with avoids both.
          </p>
        </Step>

        <Step
          number={3}
          title="Choose your pixels and sign"
          illustration={<WallDrawing />}
          lead="Now it is a wall and a rectangle. Drag anywhere free, or pick one of the sizes and click where you want it."
        >
          <p>
            The strip along the bottom tells you how many pixels you have marked and what they cost
            — a dollar a pixel, the same for the first one as for the last. Press{" "}
            <strong className="font-semibold text-ink">Buy</strong> and the rectangle is held for
            you for half an hour while you upload your picture, write a caption and add your link.
          </p>
          <p>
            Then your wallet opens and asks you to sign. Read what it says: it should be one
            transfer, in USDC, on Solana, for the amount the panel showed you. We never ask for your
            recovery phrase — no site ever should — and there is no second signature and no approval
            for us to spend anything later.
          </p>
          <p>
            <strong className="font-semibold text-ink">What you get, the moment it settles:</strong>{" "}
            your picture on the wall at the size you bought; a page of its own at{" "}
            <code className="rounded bg-card-lift px-1 py-0.5 text-[13.5px]">/b/&lt;id&gt;</code>{" "}
            with the coordinates, the amount, the settlement and how many times your link has been
            followed; and a small badge you can paste on your own site that links back to it. Your
            pixels do not change owner or content without a signature from the wallet that bought
            them, and they never expire.
          </p>
        </Step>

        <section className="mt-14 rounded-xl border border-hairline-strong bg-card p-5">
          <h2 className="font-display text-[19px] font-semibold tracking-tight">
            Three things that go wrong, and what they mean
          </h2>
          <dl className="mt-4 flex flex-col gap-4 text-[15px] leading-relaxed">
            <Trouble term="The wallet says this site could be malicious">
              That warning is usually about the transaction rather than about us: a wallet shows it
              when it cannot simulate what it is being asked to sign. Close it, reload the board and
              try again. If it keeps happening, tell us — it is our bug to find, not yours.
            </Trouble>
            <Trouble term="Buy is refused for not enough balance">
              The panel says the number you are short by. Remember the fee: a wallet with exactly
              the price in it and no SOL cannot pay for the transaction that moves it.
            </Trouble>
            <Trouble term="Nothing happens when you press Connect on a phone">
              You are probably in Safari or Chrome rather than inside Phantom&apos;s own browser.
              Open the app, use the browser inside it, and come back to this address.
            </Trouble>
          </dl>
        </section>

        <p className="mt-10 border-t border-hairline-strong pt-5 text-[15px] leading-relaxed text-body">
          Still stuck, or something here does not match what the site does?{" "}
          <Link href="/faq" className="font-semibold text-ink underline underline-offset-2">
            The questions page
          </Link>{" "}
          answers the rest, and a mismatch between the two is a bug in one of them.
        </p>

        <SiteFooter />
      </div>
    </main>
  );
}

/** One step: a number, a drawing, a lead, and the prose. */
function Step({
  number,
  title,
  lead,
  illustration,
  children,
}: {
  number: number;
  title: string;
  lead: string;
  illustration: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[15px] font-bold text-canvas">
          {number}
        </span>
        <h2 className="font-display text-[22px] font-semibold tracking-tight">{title}</h2>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-hairline-strong bg-card-lift p-5">
        {illustration}
      </div>
      <p className="mt-4 text-[16px] leading-relaxed text-ink">{lead}</p>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-body">{children}</div>
    </section>
  );
}

function Trouble({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display font-semibold text-ink">{term}</dt>
      <dd className="mt-1 text-body">{children}</dd>
    </div>
  );
}

/**
 * An outbound link, and every one on this page carries the same three things:
 * a new tab, no referrer, and no vouching. `nofollow` because this page does
 * not stake this domain's name on anybody else's.
 */
function Out({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noreferrer"
      className="font-semibold text-ink underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/* ---------------------------------------------------------------------------
   THE THREE DRAWINGS
   ---------------------------------------------------------------------------
   Drawn here, out of squares, from this repository's own tokens. No screenshot,
   no third-party mark, no stock: the same rule `docs/references-landing.md` set
   for the landing, and for the same two reasons — a licence position, and a page
   about a wall of pixels that is built out of somebody else's pictures.

   `currentColor` and the CSS variables mean both themes are one drawing rather
   than two, and `aria-label` carries what the picture says for anybody who
   cannot see it.
   ------------------------------------------------------------------------- */

/** A pixel square, the unit all three drawings are made of. */
function Px({ x, y, fill = "var(--hairline-strong)" }: { x: number; y: number; fill?: string }) {
  return <rect x={x * 8} y={y * 8} width="7" height="7" fill={fill} />;
}

/** Step 1: a browser window and a phone, each with a wallet in it. */
function WalletDrawing() {
  const ink = "var(--ink)";
  const accent = "var(--primary)";
  return (
    <svg
      viewBox="0 0 320 120"
      className="h-auto w-full max-w-[340px]"
      role="img"
      aria-label="A browser window and a phone, each showing a wallet"
    >
      <rect x="4" y="14" width="150" height="92" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="4" y="14" width="150" height="14" fill={ink} />
      <g transform="translate(46, 46)">
        {[0, 1, 2, 3].map((x) => (
          <Px key={`a${x}`} x={x} y={0} fill={x === 3 ? accent : "var(--hairline-strong)"} />
        ))}
        {[0, 1, 2, 3].map((x) => (
          <Px key={`b${x}`} x={x} y={1} fill="var(--hairline-strong)" />
        ))}
        {[0, 1, 2, 3].map((x) => (
          <Px key={`c${x}`} x={x} y={2} fill={x === 0 ? accent : "var(--hairline-strong)"} />
        ))}
      </g>
      <rect x="196" y="4" width="64" height="112" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="196" y="4" width="64" height="10" fill={ink} />
      <g transform="translate(210, 40)">
        {[0, 1, 2].map((x) => (
          <Px key={`d${x}`} x={x} y={0} fill={x === 1 ? accent : "var(--hairline-strong)"} />
        ))}
        {[0, 1, 2].map((x) => (
          <Px key={`e${x}`} x={x} y={1} fill="var(--hairline-strong)" />
        ))}
      </g>
      <rect x="204" y="76" width="48" height="14" fill={accent} />
      <path d="M170 60 h16 m-6 -6 l6 6 l-6 6" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="276" y="44" width="40" height="8" fill="var(--hairline-strong)" />
      <rect x="276" y="58" width="28" height="8" fill="var(--hairline-strong)" />
    </svg>
  );
}

/** Step 2: money going in, from an exchange or from a card. */
function FundingDrawing() {
  const ink = "var(--ink)";
  const accent = "var(--primary)";
  return (
    <svg
      viewBox="0 0 320 120"
      className="h-auto w-full max-w-[340px]"
      role="img"
      aria-label="A card and an exchange, both sending money into a wallet"
    >
      <rect x="4" y="16" width="76" height="46" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="4" y="26" width="76" height="8" fill={ink} />
      <rect x="12" y="44" width="30" height="6" fill="var(--hairline-strong)" />
      <rect x="4" y="76" width="76" height="34" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="12" y="86" width="18" height="14" fill="var(--hairline-strong)" />
      <rect x="36" y="90" width="14" height="10" fill="var(--hairline-strong)" />
      <rect x="56" y="84" width="14" height="16" fill="var(--hairline-strong)" />
      <path d="M92 46 h44 m-10 -8 l10 8 l-10 8" fill="none" stroke={ink} strokeWidth="2" />
      <path d="M92 92 h44 m-10 -8 l10 8 l-10 8" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="150" y="20" width="96" height="84" fill="none" stroke={ink} strokeWidth="2" />
      <rect x="150" y="20" width="96" height="12" fill={ink} />
      <g transform="translate(170, 48)">
        {[0, 1, 2, 3, 4].map((x) => (
          <Px key={`f${x}`} x={x} y={0} fill={x % 2 === 0 ? accent : "var(--hairline-strong)"} />
        ))}
        {[0, 1, 2, 3, 4].map((x) => (
          <Px key={`g${x}`} x={x} y={1} fill="var(--hairline-strong)" />
        ))}
      </g>
      <rect x="166" y="82" width="64" height="10" fill="var(--hairline-strong)" />
      <rect x="262" y="40" width="54" height="8" fill="var(--hairline-strong)" />
      <rect x="262" y="54" width="38" height="8" fill="var(--hairline-strong)" />
      <rect x="262" y="68" width="46" height="8" fill={accent} />
    </svg>
  );
}

/** Step 3: the wall, and one rectangle marked on it. */
function WallDrawing() {
  const ink = "var(--ink)";
  const accent = "var(--primary)";
  const cells = [];
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 34; x += 1) {
      const taken = (x * 7 + y * 13) % 11 < 3;
      if (taken) cells.push(<Px key={`${x}-${y}`} x={x} y={y} />);
    }
  }
  return (
    <svg
      viewBox="0 0 288 96"
      className="h-auto w-full max-w-[340px]"
      role="img"
      aria-label="A wall of small squares with one rectangle marked out on it"
    >
      <g transform="translate(6, 8)">{cells}</g>
      <rect
        x="118"
        y="28"
        width="72"
        height="40"
        fill="none"
        stroke={accent}
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <rect x="126" y="36" width="56" height="24" fill={accent} opacity="0.22" />
      <rect x="6" y="8" width="276" height="80" fill="none" stroke={ink} strokeWidth="2" />
    </svg>
  );
}
