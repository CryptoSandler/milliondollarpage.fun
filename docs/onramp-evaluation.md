# Embedded crypto on-ramp evaluation

**For:** milliondollarpage.fun — pixels at $1 each, paid in USDC on Solana, buyer pays from
their own wallet, server only verifies on-chain.
**Owner context:** individual (not a company) in Spain. Buyers expected from Spain and Latin
America. No Vercel deployment, no DNS, nothing live. No hot wallet in the repository.

**Research date:** all pages fetched **2026-08-28** unless a page carried its own date, which
is then quoted. Every material claim below cites the URL it came from. Figures I could only
find on third-party sites, or could not confirm at all, are flagged explicitly.

---

## 0. The finding that comes before the comparison

The on-ramp is **architecturally decoupled** from this product. The buyer funds their own
wallet, then pays the wall from it; the server verifies the transfer on-chain. The on-ramp is
therefore a *convenience link*, not a payment rail. Nothing in the purchase flow depends on it.

That means there are two products here, not one, and they have wildly different costs:

| | What it needs | What it costs the owner |
|---|---|---|
| **Option 0 — plain outbound link** to a provider's own consumer site | Nothing. No entity, no KYB, no API key, no DNS, no agreement. | Zero. Ships today. |
| **Option 1 — merchant widget integration** | Entity + KYB + verified domain + API key + signed agreement, at every provider evaluated | Weeks of onboarding, and a legal entity the owner does not have |

The **only** things Option 1 buys over Option 0 are (a) pre-filling the buyer's destination
wallet address so they don't copy-paste it, and (b) the ability to take a partner fee (which
this project does not want — it would be a markup on the buyer).

Every provider evaluated requires an API key to pre-fill a destination `walletAddress`, and
MoonPay additionally requires the URL to be cryptographically signed whenever `walletAddress`
is passed ("Signing is also required whenever you pass `walletAddress`, `walletAddresses`, or
other sensitive parameters; the widget fails to load without it" —
https://dev.moonpay.com/widget/on-ramp/integration-methods/url.md). So there is **no** way to
pre-fill the address anonymously.

**This is the lazy rung, and it holds.** Ship Option 0 now — a link that says "Need USDC on
Solana? Buy it here" pointing at the provider's public buy page, with the buyer pasting their
own address. Revisit Option 1 only if link-out drop-off is measured and material. The rest of
this document evaluates Option 1 so the owner knows exactly what that upgrade costs when and
if they want it.

---

## 1. Providers evaluated, and why

Required: MoonPay, Coinbase Onramp, plus a third. I evaluated **two** additional providers
rather than one, because the third-provider picture changed materially once I checked primary
sources:

- **Transak** — the obvious third. I picked it first because it exposes public APIs
  (`api.transak.com`) that let me verify limits and asset support first-hand rather than from
  a marketing page.
- **Ramp Network** — added after Transak's public fee documentation turned out to have been
  **removed** (see §4) and its country coverage turned out to be **contradictory between its
  own sources** (see §4). Ramp exposes a public `host-api` that answered every question I had
  about limits, minimums and Solana assets directly, and publishes a complete fee schedule.
  Excluding it would have hidden the best-fitting option from the owner.

---

## 2. MoonPay

### 2.1 What it demands of the owner

**Unverified — requires contacting sales.** This is a real finding, not a gap in the research.
MoonPay's developer documentation does not publish partner eligibility criteria anywhere I
could find. The requirements page states only:

> "A partner account and API credentials" … "MoonPay will work with you directly to set up
> your account and credentials."
> — https://dev.moonpay.com/platform/overview/requirements.md

I checked https://dev.moonpay.com/platform/guides/onboarding-paths.md as well; that page
covers *end-user* onboarding paths (hosted / API-driven / guest checkout), not partner
onboarding. `https://www.moonpay.com/business/on-ramps` returns a 404.

**What I can confirm:**

- **Not self-serve.** The phrase "MoonPay will work with you directly" plus the absence of any
  public signup-to-production path indicates a sales-assisted onboarding. I could not confirm
  whether an individual or Spanish *autónomo* is acceptable versus a registered company.
- **Test mode exists and is usable during build**, using a `sk_test_...` key from the MoonPay
  dashboard — but a dashboard account is itself the gated step, so this does not help before
  onboarding. Limits: "Test-mode purchases deliver 1/100th of the quoted amount because
  MoonPay holds limited testnet funds", KYC is simulated, Solana is on Devnet.
  — https://dev.moonpay.com/platform/overview/test-mode.md
- **IP allowlisting is mandatory to go live**, and it only works on signed URLs: "IP matching
  is mandatory for going live, and the `allowedIpAddress` parameter it uses only works on
  signed URLs, so signing is part of every URL you generate."
  — https://dev.moonpay.com/widget/on-ramp/integration-methods/url.md
- Minimum volume: **not stated publicly. Unverified.**

### 2.2 Fees to the buyer

Spain is in the EEA, so the **Europe** pricing disclosure governs, not the general one. This
distinction matters and is easy to get wrong.
— https://www.moonpay.com/legal/europe_pricing_disclosure (no effective date on the page)

| Payment method | Buy processing fee |
|---|---|
| Payment cards & alternative payment methods | Up to **4.5%** |
| Bank transfers (incl. SEPA) | Up to **1%** |
| PayPal | Up to 4.5% |

Minimum fee, quoted exactly:

> "A minimum MoonPay fee of **€3.99** will be applied if your transaction amount is below a
> minimum threshold."

and, decisively for this product:

> "If you were referred to the MoonPay platform by a partner, your MoonPay fee will be in an
> amount up to 4.5%, subject to a minimum MoonPay fee that will never be more than
> **€/£/$4.50**."

A widget on milliondollarpage.fun is the *partner-referred* case. **€4.50 is the floor.**

**Plus, separately from the stated fee:**
- **Spread**, folded into the displayed asset price, not shown as a line item: "All spreads are
  included in the price of the crypto asset shown to you during your checkout flow." Size not
  disclosed.
- **Network fee**, shown as a line item.
- **Ecosystem fee**, 0–10% (typically 0–2%), set by the partner. This project would set 0%.
- Non-EUR/USD/GBP purchases increase the minimum fee by a further **0.25%–10%** depending on
  currency — this hits every Latin American buyer paying in local currency.

**Minimum purchase: $20 / €20.** Verified two independent ways:

> "The minimum transaction amount for buying crypto is **$20** (or the equivalent in another
> fiat currency)."
> — https://support.moonpay.com/en/articles/389117-payment-methods-settlement-times-and-limits

and from MoonPay's own live public API (`https://api.moonpay.com/v3/currencies`, queried
2026-08-28): `eur` → `minBuyAmount: 20`, `usd` → `minBuyAmount: 20`.

**What this means for a $1–$50 product:** a buyer who wants $20 of USDC pays a €4.50 minimum
fee — **22.5%** — before spread and network fee. A buyer who wants $5 of USDC **cannot
transact at all**. This is the single most product-shaping fact in this document.

### 2.3 Non-custodial delivery

**Yes.** The widget takes a `walletAddress` parameter and delivers the asset to it on-chain.
Funds never pass through the owner's account or any address the owner controls. The owner is a
referrer, not a party to the transaction.

**Caveat:** passing `walletAddress` requires URL signing with the secret key, so this cannot be
done without an approved partner account (see §2.1).

**Regulated-role question:** nothing in MoonPay's developer documentation states that a
referring partner takes on a regulated role. I did **not** find an affirmative statement either
way, and **this is a legal question I am not qualified to answer and did not verify.** See §7.

### 2.4 Country coverage

Verified directly from MoonPay's live public API `https://api.moonpay.com/v3/countries`
(queried 2026-08-28). All seven target countries return `isBuyAllowed: true`:

| Country | Buy allowed | Local currency on the on-ramp | Notes |
|---|---|---|---|
| Spain 🇪🇸 | ✅ | EUR (min €20) | SEPA + SEPA Instant available |
| Mexico 🇲🇽 | ✅ | MXN (min 450, max 260,000) | Card only |
| Brazil 🇧🇷 | ✅ | BRL (min 130, max 65,000) | **PIX supported** (BRL only, 1 business day) |
| Colombia 🇨🇴 | ✅ | COP (min 100,000) | `isSellAllowed: false` — buy only |
| Chile 🇨🇱 | ✅ | ❌ no CLP | Must pay by card in USD/EUR |
| Peru 🇵🇪 | ✅ | PEN (min 80, max 40,000) | Card only |
| Argentina 🇦🇷 | ✅ | ❌ no ARS | Must pay by card in USD/EUR |

Cross-checked against MoonPay's unsupported-countries list
(https://support.moonpay.com/en/articles/380968-moonpay-s-unsupported-countries): none of the
seven appear on it.

**This is MoonPay's strongest card — the broadest verified Latin American coverage of the
four, including PIX in Brazil.**

### 2.5 Solana + USDC

**Confirmed on mainnet, from the live API**, not a marketing page
(`https://api.moonpay.com/v3/currencies`, queried 2026-08-28):

| Code | Asset | Network | Live | Test mode | Min buy | Contract |
|---|---|---|---|---|---|---|
| `sol` | Solana | solana | ✅ | ✅ | 0.047 SOL | native |
| `usdc_sol` | USD Coin | solana | ✅ | ❌ | 5.01 | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |

The contract address is the canonical USDC mint on Solana mainnet. **Note the gap:
`usdc_sol` has `supportsTestMode: false`** — you cannot test the USDC-on-Solana path in test
mode, only the SOL path. That is a genuine integration hazard.

---

## 3. Coinbase Onramp

### 3.1 What it demands of the owner

**The lightest start of the four, but a domain wall at the end.**

Prerequisites, quoted:
> "A CDP account — Create your free Coinbase Developer Platform account. Verify your email and
> set up 2-factor authentication (2FA)." … "CDP Secret API Key"
> — https://docs.cdp.coinbase.com/onramp/introduction/quickstart

No KYB, no entity, no sales call is documented for creating a CDP account and building against
Onramp. **However:**

- **New integrations start in trial mode with limits.** "New integrations start in trial mode
  — apply for full access to remove limits."
  — https://docs.cdp.coinbase.com/onramp/introduction/welcome, form at
  https://support.cdp.coinbase.com/onramp-onboarding
- **The onboarding flow verifies your domain.** "To get started with your web app integration,
  apply for Onramp access. The onboarding flow will guide you through the process of
  **verifying your domain**."
  — https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
- **Domain allowlist required for redirects.** `redirectUrl` must match an entry added under
  CDP Portal → Payments → Onramp & Offramp, or "the redirect will be silently ignored".
  — https://docs.cdp.coinbase.com/onramp/security-requirements
- **CORS is a stated liability term**, not a suggestion: "You are responsible and will be
  liable for any misuse of your endpoints due to improper implementation of these security
  measures." (same page)
- **What the trial-mode limits actually are: not published. Unverified.**
- **Whether an individual with no company can pass the full-access review: not published.
  Unverified.**

Testing: there is a hidden debug menu — click "Secured" ten times at the bottom of the modal,
then Actions → "Enable Mocked Buy and Send".
— https://docs.cdp.coinbase.com/onramp/additional-resources/faq

### 3.2 Fees to the buyer

Quoted from https://docs.cdp.coinbase.com/onramp/additional-resources/faq:

> "**Card and ACH:** There is a **2.5% fee for credit card transactions**, and **0.5% fee for
> ACH**"

Plus a **spread** folded into the price ("Coinbase Onramp includes a spread in the price when
you buy cryptocurrencies"), plus network fees. **The spread is not quantified anywhere on
Coinbase's own documentation.** Note also: "Fees are calculated at the time you place your
order and may be determined by a combination of factors" — i.e. the 2.5% is indicative.

**Zero-fee USDC is not generally available.** This is widely misreported. Coinbase's own words:

> "**USDC:** Zero-fee USDC onramping is available to **select partners through a subsidy
> program for eligible partners**. Contact your account representative to learn more."

An individual in Spain with no live site is not a "select partner". Treat zero-fee USDC as
**unavailable and unverified for this project**.

**ACH is US-only**, so the 0.5% rate is irrelevant here — Spanish and Latin American buyers
pay the card rate. There is **no SEPA option** documented for Coinbase Onramp; the payment
methods table lists only Coinbase account balances, debit cards, credit cards and US ACH.
— https://docs.cdp.coinbase.com/onramp/additional-resources/payment-methods

**Minimums:** Apple Pay / Google Pay ≈ **$5 USD**. The documentation's worked example for the
US shows a card minimum of `$10.00` and ACH `$10.00`, but that is an illustrative API response,
not a rate card — real minimums come from the Options API per country and **I could not query
it, because it requires an authenticated CDP key I do not have. Unverified for Spain and
Latin America.**

### 3.3 Non-custodial delivery

**Yes.** The session token is created server-side with the destination address:

```
POST https://api.developer.coinbase.com/onramp/v1/token
{ "addresses": [{ "address": "...", "blockchains": ["solana"] }], "clientIp": "..." }
```

Coinbase then sends the crypto directly to that address. Funds never touch the owner.
— https://docs.cdp.coinbase.com/onramp/introduction/quickstart

**Architectural constraint worth knowing up front: the widget cannot be embedded.**

> "No, the Coinbase Onramp widget cannot be embedded in an iframe. It must be opened in either
> a popup or a new tab."
> — https://docs.cdp.coinbase.com/onramp/additional-resources/faq

So "embedded on-ramp" is a misnomer for Coinbase. It is a redirect.

### 3.4 Country coverage — and the buyer-account problem

> "Coinbase Onramp is available in all countries which Coinbase operates **except Japan**."
> — https://docs.cdp.coinbase.com/onramp/additional-resources/faq

Debit cards: "US and 90+ additional countries (including EU, UK, CA)". Credit cards:
"90 countries (including EU, UK, CA, and excluding US)".

**I could not obtain a per-country list.** The Config API requires an authenticated CDP key.
`https://www.coinbase.com/places` redirects to the Coinbase homepage and no longer renders a
country table. **So: Spain is near-certainly covered (EU is named explicitly); Mexico,
Argentina, Brazil, Colombia, Chile and Peru are UNVERIFIED.** A third-party search summary
claimed all of them are Coinbase countries — I am flagging that as **third-party, not from
Coinbase's own site, and not relied upon.**

**The bigger problem is the funnel, not the map.** Coinbase's integration-options table
describes Coinbase-hosted Onramp as:

> "Coinbase account payment methods · **Global for Coinbase users** · No developer fees"

and Headless Onramp (the Apple Pay / Google Pay path) as:

> "Card payment methods only · Up to $2.5K weekly for cards · **US-only** · **Access fee
> required**"
> — https://docs.cdp.coinbase.com/onramp/onramp-overview

Headless is **US-only and costs money**. That leaves Coinbase-hosted Onramp for Spain and
Latin America, which means the buyer needs a Coinbase account — unless Guest Checkout applies,
and Guest Checkout was already limited to "the US, UK, and Canada".

**And Guest Checkout is on the way out:**

> "**Will be deprecated on June 30, 2026:** Guest Checkout (debit card, Apple Pay) via the
> Coinbase-hosted widget is being discontinued."
> — https://docs.cdp.coinbase.com/onramp/onramp-overview and .../faq

**Honest flag:** today is 2026-08-28, so that date has passed, yet the documentation still
says "will be". Either the deprecation slipped or the docs are stale. **I could not determine
which.** Either way it does not change the conclusion for this project, because Guest Checkout
never covered Spain or Latin America.

**Net: for a Spanish or Latin American buyer, Coinbase Onramp effectively requires them to
already have a Coinbase account.** For a novelty pixel purchase of $1–$50, "first create a
Coinbase account and pass KYC" is a funnel that will not convert.

### 3.5 Solana + USDC

Solana is listed as a supported Layer-1 network alongside Bitcoin, Ethereum, Polygon and
Avalanche (https://docs.cdp.coinbase.com/onramp-&-offramp/introduction/welcome), and
"Coinbase Onramp supports all assets and networks available for trade/send/receive on
Coinbase.com". USDC on Solana is supported by Coinbase generally.

**But I could not confirm USDC-on-Solana as a purchasable Onramp asset from Coinbase's own
API**, because the Options API requires authentication. The documentation's own worked example
lists USDC on `ethereum-mainnet` and `polygon-mainnet` only — that example is illustrative,
not exhaustive, but it means **I have no primary-source confirmation of the specific
USDC-on-Solana Onramp path. Unverified.** Coinbase publishes an availability checker at
https://onramp-asset-availability.vercel.app/ which the owner can check directly.

---

## 4. Transak

### 4.1 What it demands of the owner

**A registered business. Explicitly.**

> "Sign up at the Partner Dashboard using your **corporate email**. You'll get immediate access
> to the order dashboard and **staging API key** … **Submit your KYB** form so our compliance
> team can review and approve your application. **KYB is required to gain access to your
> production API key.**"
> — https://docs.transak.com/getting-started/what-is-transak

KYB form: https://forms.transak.com/kyb — described elsewhere as "**verify your business** and
enable your API key for Production" (https://docs.transak.com/guides/partner-faqs).

Also required:
- **Domain whitelisting.** `referrerDomain` is mandatory on all products, and "Widget blocked
  due to domain not whitelisted — Submit the additional domain for whitelisting; **domain must
  match exactly** with `referrerDomain` used during session generation."
- **Some query parameters are gated behind KYB:** "Some parameters can only be used by partners
  that have had their KYB approved."
- One API key per company: "If two websites are with same company then you can integrate with
  same API_KEY. Otherwise you need to submit KYB for each company."

**Sandbox before onboarding: yes, and this is Transak's best feature for a pre-launch repo.**
Staging API key is issued immediately on dashboard signup, and "Is KYC required on the STAGING
environment? **No it is not required in staging.**" Sandbox credentials at
https://docs.transak.com/guides/sandbox-credentials.

Minimum volume: none for the widget. (The **Whitelabel API** — not needed here — requires
either a ~$1M/month volume commitment or a flat **$10,000** integration fee.)

### 4.2 Fees to the buyer

**Not publicly documented. This is a finding.**

Transak's Partner FAQ points to a Notion page for its fee schedule
(https://transak.notion.site/On-Ramp-Payment-Methods-Fees-Other-Details-b0761634feed4b338a69f4f186d906a5).
When fetched on 2026-08-28, that page **redirects to a renamed page** —
"On-Ramp: Payment Methods, **Limits** & Other Details" — with the fee columns **removed**, and
ends with:

> "For fee enquiry on any other details, please reach out to sales@transak.com"

I also attempted to derive real fees empirically from Transak's public price API using the
demo key published in its own docs. It returned:

```
{"error":{"statusCode":400,"name":"Bad Request",
 "message":"There are some limitation in your partner account, Please contact us at support@transak.com."}}
```

**Verdict: Transak's on-ramp fee percentages are unverified and require contacting sales.**
The published fee *formula* is `C = (F - (F × P% + F × T% + N)) × R`, where `T` is the Transak
fee that varies by payment method — but the value of `T` is no longer public.

**Minimums I could verify**, from the live public API
(`https://api.transak.com/api/v2/currencies/fiat-currencies`, queried 2026-08-28):

| Currency | Card min | Card max | Bank transfer min |
|---|---|---|---|
| EUR | **€4** | €5,153 | SEPA €17 / Open Banking €17 |
| USD | $5 | $3,000 | Wire $1,000 |
| MXN | 85 (~$4.5) | 101,854 | — |
| BRL | 26 (~$5) | 30,976 | — |

**€4 is the lowest card minimum of the four providers** — genuinely well-suited to small
purchases, if the fee percentage turns out to be reasonable.

### 4.3 Non-custodial delivery

**Yes.** `walletAddress` is a widget parameter, and `disableWalletAddressForm` can lock it so
the buyer cannot edit it. Funds go direct to that address.
— https://docs.transak.com/guides/partner-faqs

**Transak is the only provider of the four whose widget can be genuinely embedded in an
iframe** — "load the resulting URL in an iframe, WebView, or redirect". Coinbase forbids
iframes outright; MoonPay and Ramp support embedding but require signed/keyed URLs.

### 4.4 Country coverage — contradictory, and that is the finding

Transak's own sources disagree with each other:

| Source | What it says |
|---|---|
| `transak.com/global-coverage`, live 2026-08-28 | "**26+ countries**". Rendered rows: North America (Bermuda, Canada, Mexico, Puerto Rico), all US states, Asia (Georgia, Hong Kong, Israel, Kuwait, Malaysia, Philippines), Oceania. **The South America and Europe sections rendered empty.** |
| Search-engine cache of the same page | "**63+ countries**" — i.e. coverage appears to have been cut recently |
| `api.transak.com/api/v2/countries` | Returns exactly **26** countries. Contains Mexico, Brazil, Peru. **Does NOT contain Spain, Argentina, Colombia, or Chile.** Contains Andorra and Montenegro but not Germany, France or Italy — so this endpoint is **partial or legacy** (it also still references `wyre` as a partner, a company defunct since 2023) |
| `api.transak.com/api/v2/currencies/fiat-currencies` | EUR lists `supportingCountries` **including ES** (and DE, FR, IT, PT…). Full fiat list is 26 currencies: **no ARS, no COP, no CLP, no PEN** |
| Transak's Notion limits page | Card payments: "All countries 🌎", with MXN and BRL among supported card currencies. Open Banking explicitly lists **Spain** 🇪🇸 |

**What I can state with confidence:**
- **Spain: supported** (EUR + Open Banking explicitly names Spain).
- **Mexico: supported** (MXN card).
- **Brazil: supported** (BRL card). **No PIX** in Transak's on-ramp method list.
- **Peru: probably supported** but PEN is absent from the live fiat-currency list. Ambiguous.
- **Argentina, Colombia, Chile: no local currency rail exists.** Whether residents can pay by
  card in USD/EUR is **unverified.**

The apparent drop from 63+ to 26+ countries is a real risk signal the owner should raise with
Transak directly before building on it.

### 4.5 Solana + USDC

**Confirmed from the live API** (`https://api.transak.com/api/v2/currencies/crypto-currencies`,
queried 2026-08-28):

| Symbol | Network | Buyable | Contract |
|---|---|---|---|
| SOL | solana | ✅ | native |
| **USDC** | **solana** | ✅ | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | solana | ❌ (`isPayInAllowed: false`) | — |

Correct canonical USDC mint. Solana Devnet available in staging.

---

## 5. Ramp Network

### 5.1 What it demands of the owner

**A registered legal entity and a commercially-owned domain. Both, explicitly, in writing.**

> "**1. Your business is a legal entity.** Your business must be registered or incorporated
> with the authorities of your country … you'll have to provide us with proof of
> registration/incorporation. Examples of such documents include … Company registration
> certificate; Certificate of incorporation; Certificate of good standing."
>
> "**2. Your business has clear terms of service on your website or app.** … you must have a
> professional, public website or application, under a **commercially-owned domain (no free
> domains)**, with explicit, easy-to-find terms and conditions/terms of use."
>
> — https://rampnetwork.com/blog/integrating-with-ramp-network-things-you-need-to-get-started

**Date caveat, flagged:** that page carries "Last edited on **September 8, 2022**". It is
Ramp's own currently-published statement of partner requirements and is still linked from its
site, but it is nearly four years old. **Treat the specifics as indicative and confirm with
Ramp.** Ramp's Terms of Service, by contrast, were "Last updated **20th July 2026**"
(https://ramp.network/terms-of-service) — so the company is actively maintaining legal docs
while leaving this requirements page stale.

**Good news in the same article, and it directly addresses this repo's situation:**

> "**Applying for a partnership before your product is live** … we encourage you to apply for a
> partnership *even before your product is live*. … So long as you meet the other conditions
> outlined in this guide, you can integrate with Ramp Network immediately. Even if you choose
> to wait until you go live to apply, you can still take our integration for a spin and test it
> straight away. We encourage you to play around as much as you want in our **sandbox
> environment — it's totally free!**"

And: "**Integrating and running Ramp Network is free of charge for partners.**"

Restricted-industry list checked: gambling, betting, lotteries, sweepstakes, **games of
chance**, adult content, weapons, MLM, drop-shipping. **Selling pixels on a wall is not on that
list**, but it is close enough to "novelty / speculative" that the owner should describe the
product plainly in the application rather than let compliance guess. Not a gambling product —
buyers receive a defined, permanent good (pixels) at a fixed price.

Onboarding time: a third-party-sourced claim of "1–2 business days" appeared in search results.
**Flagged as not confirmed on Ramp's own site.**

### 5.2 Fees to the buyer

**The most transparent and completely published schedule of the four.**
Source: https://support.ramp.network/en/articles/10415-what-fees-are-charged-when-buying-crypto
— page dated **June 25, 2025**. All fees priced in EUR and converted for other currencies.

| Method | Minimum fee | Fee percentage |
|---|---|---|
| Bank transfers (manual, incl. SEPA) | Up to **€2.49** | Up to **1.40%** |
| Easy Bank Transfer (open banking, EU) | Up to €2.49 | Up to **2.40%** |
| Credit/debit card (USD, EUR, GBP) | Up to €2.49 | Up to **3.9%** |
| Credit/debit card (other currencies) | Up to €2.49 local equiv. | Up to **5.45%** |
| Apple Pay / Google Pay | Same as underlying card | Same as underlying card |
| **PIX** (Brazil) | Up to €2.49 | Up to **2.90%** |

Plus network fee (paid to validators, "we do not influence its amount") and an **optional
partner fee** which "does not apply when buying directly through Ramp Network" — this project
would set it to zero.

Ramp also notes a partner-specific baseline rate card exists
(https://support.ramp.network/en/articles/31326-what-are-the-baseline-fees-for-integration-partners) —
**I did not fetch that page, so partner rates are unverified**; the consumer rates above are
the conservative ceiling.

**Minimums, verified from Ramp's live public API** (`api.ramp.network/api/host-api/v3/assets`,
queried 2026-08-28) — this is primary-source data, per currency:

| Currency | Min purchase | Max purchase | Min fee | USDC-on-Solana available |
|---|---|---|---|---|
| **EUR** | **€6.00** | €15,000 | €2.49 | ✅ |
| USD | $6.99 | $17,466 | $2.90 | ✅ |
| **MXN** | 118.61 (~$6.4) | 296,512 | 49.23 (~$2.65) | ✅ |
| **BRL** | 36.08 (~$6.7) | 90,187 | 14.98 (~$2.8) | ✅ |
| **COP** | 22,069.80 (~$5.5) | 55,174,495 | 9,158.97 (~$2.3) | ✅ |
| **PEN** | 23.42 (~$6.2) | 58,531 | 9.72 (~$2.6) | ✅ |
| ARS | ❌ `FIAT_CURRENCY_NOT_SUPPORTED` | — | — | — |
| CLP | ❌ `FIAT_CURRENCY_NOT_SUPPORTED` | — | — | — |

### 5.3 Non-custodial delivery

**Yes.** Ramp is a host-API model: the widget receives the destination address and Ramp
settles on-chain to it. Funds never route through the owner. Ramp markets itself as a
"Non-custodial Web3 Wallet" company and its partner model is explicitly a referral integration
with an optional partner fee — the same structure as the others.

Same legal caveat as §2.3 applies; see §7.

### 5.4 Country coverage

Verified per-currency from the live API (table above): **Spain, Mexico, Brazil, Colombia and
Peru all have working local-currency on-ramp rails with USDC-on-Solana available.**
**Argentina and Chile have no local currency** — buyers there would need a Visa/Mastercard
denominated in a supported currency, and whether Ramp accepts AR/CL residents at all is
**unverified.**

Ramp supports PIX in Brazil at 2.90% (fee table above) — a meaningful advantage, since PIX is
the dominant Brazilian payment method. A third-party search summary claimed "150+ countries";
**flagged as not confirmed from Ramp's own documentation.**

Cards: Visa and Mastercard only
(https://support.ramp.network/en/articles/12630-what-payment-methods-does-ramp-support-for-buying-crypto).

### 5.5 Solana + USDC

**Confirmed from the live API**, mainnet, with the canonical mint:

| Symbol | Chain | Enabled | Min purchase (EUR) | Contract |
|---|---|---|---|---|
| SOL | SOLANA | ✅ | €6.00 | native |
| **USDC** | **SOLANA** | ✅ | **€6.25** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | SOLANA | ✅ | €6.25 | `Es9vMFr…` |
| AUSD, APE | SOLANA | ✅ | €6.25 | — |

---

## 6. Comparison table

### The five questions

| | **MoonPay** | **Coinbase Onramp** | **Transak** | **Ramp Network** |
|---|---|---|---|---|
| **1. Owner requirements** | ❓ **Unverified — sales-gated.** No public eligibility criteria. "MoonPay will work with you directly." IP allowlist + URL signing mandatory to go live. Test mode needs a dashboard account. | 🟡 Self-serve CDP account, email + 2FA, **no KYB documented**. But: trial mode with **undisclosed limits**, and full access requires an application that **verifies your domain**. Individual eligibility unverified. | 🔴 **Registered business required.** Corporate email + KYB at forms.transak.com/kyb for production key. Exact domain whitelist. **Staging key immediate, no KYC in staging.** | 🔴 **Registered legal entity required** (proof of incorporation) **+ commercially-owned domain with published ToS**. But **free sandbox before applying**, and **explicitly invites pre-launch applications**. Free for partners. |
| **2. Buyer fees** | Card **up to 4.5%**, bank/SEPA **up to 1%**, **but €4.50 minimum for partner-referred traffic** + undisclosed spread + network fee + 0.25–10% surcharge on non-EUR/USD/GBP. **Min purchase €20/$20.** | Card **2.5%**, ACH 0.5% (US only, irrelevant here) + **undisclosed spread**. **No SEPA.** Zero-fee USDC is **select partners only**. Min ≈$5 (Apple/Google Pay); card min for ES/LatAm **unverified**. | ❓ **Fee % no longer published** — removed from the docs page, and the demo API key is blocked. Requires sales@transak.com. **Card min €4** (lowest of the four). | ✅ **Fully published.** SEPA/bank **1.40%**, open banking 2.40%, card **3.9%** (EUR/USD/GBP), **PIX 2.90%**. **€2.49 min fee. Min purchase €6.** |
| **3. Non-custodial to arbitrary wallet** | ✅ Yes, via `walletAddress` — **but requires a signed URL, so a partner account is mandatory**. | ✅ Yes, via server-side session token. **⚠️ Cannot be iframed** — popup or new tab only. | ✅ Yes, `walletAddress` + `disableWalletAddressForm`. **Only provider that supports true iframe embedding.** | ✅ Yes, via host-API widget. |
| **4. ES + LatAm** | ✅ **Best coverage. All 7 verified `isBuyAllowed`.** Local currency for ES/MX/BR/CO/PE. **PIX in Brazil.** No ARS/CLP. | 🟡 EU named explicitly → Spain near-certain. **All 6 LatAm countries UNVERIFIED** (Config API gated). **Buyer needs a Coinbase account** — Guest Checkout was US/UK/CA only and is being discontinued. | 🟡 Spain ✅, Mexico ✅, Brazil ✅ (no PIX), Peru ambiguous. **Argentina, Colombia, Chile: no rail.** Coverage appears to have dropped **63+ → 26+**. | ✅ **ES, MX, BR, CO, PE all verified** with local currency + USDC-on-Solana. **PIX in Brazil at 2.90%.** ❌ **ARS and CLP explicitly unsupported.** |
| **5. Solana + USDC** | ✅ `usdc_sol`, canonical mint, live. **⚠️ `supportsTestMode: false` — cannot test the USDC-Solana path.** | 🟡 Solana listed as supported network; **USDC-on-Solana Onramp path UNVERIFIED** (Options API gated). Doc example shows USDC on ETH/Polygon only. | ✅ USDC on Solana, canonical mint, buyable. Devnet in staging. | ✅ USDC on Solana, canonical mint, buyable, **min €6.25**. |

### Secondary questions

| | MoonPay | Coinbase | Transak | Ramp |
|---|---|---|---|---|
| **Usable without a merchant API key?** | ❌ No — key + signature required | ❌ No — session token required | ❌ No — `apiKey` + `referrerDomain` required | ❌ No — `hostApiKey` required |
| **Integration surface** | Hosted URL (signed) + SDKs | Hosted URL only, **no iframe** | Hosted URL + JS SDK, **iframe OK** | Hosted URL + SDK |
| **Requires a live site at a verified domain?** | ⚠️ IP allowlist mandatory to go live | ✅ **Yes — domain verification in onboarding** | ✅ **Yes — exact-match domain whitelist** | ✅ **Yes — commercially-owned domain with ToS**, but may apply pre-launch |

### What a small purchase actually costs

Buyer wants **€20 of USDC on Solana**, paying by card from Spain (fees only; spread and network
fee are extra everywhere and are not disclosed by MoonPay or Coinbase):

| Provider | Fee charged | Effective rate | Possible at all? |
|---|---|---|---|
| MoonPay | €4.50 (partner minimum) | **22.5%** | Only just — €20 is the exact minimum |
| Coinbase | ~€0.50 (2.5%) + undisclosed spread | ~2.5%+ | Yes — **if** the buyer has a Coinbase account |
| Transak | Unknown | Unknown | Yes (min €4) |
| **Ramp** | **€2.49** (min fee floor) | **12.45%** | Yes (min €6) |

At **€64** the card fee floor and percentage cross over for Ramp; above that a Ramp card buyer
pays a flat 3.9%. A **€100** SEPA purchase on Ramp costs €1.40 (1.40%) versus MoonPay's €4.50.
**Ramp is cheaper than MoonPay at every purchase size this product will see**, and it is the
only provider that lets a buyer purchase less than €20 at all.

---

## 7. What I could not verify — read this before acting

1. **MoonPay partner eligibility.** Whether an individual or a Spanish *autónomo* can become a
   partner at all, what documents are required, whether there is a minimum volume, and whether
   a signed agreement or sales call precedes access. **Nothing is published. Requires
   contacting MoonPay.**
2. **Transak's on-ramp fee percentages.** Removed from the previously-linked public page;
   the public demo API key is rate-limited out. **Requires sales@transak.com.**
3. **Coinbase trial-mode limits.** Not published anywhere I could find.
4. **Coinbase country list for Latin America**, and **Coinbase's USDC-on-Solana Onramp
   availability.** Both live behind the authenticated Config/Options APIs. The owner can check
   assets at https://onramp-asset-availability.vercel.app/ with a CDP key.
5. **Coinbase card minimums for Spain and Latin America.** The `$10` figure in the docs is a
   US illustrative example, not a rate card.
6. **Whether Coinbase Guest Checkout was actually discontinued** on 2026-06-30. The docs still
   say "will be deprecated" after that date has passed. Does not change the conclusion, since
   Guest Checkout never covered Spain or Latin America.
7. **Ramp's partner-specific baseline fees** (a separate support article I did not fetch) and
   Ramp's **current** partner requirements — the requirements page is dated **September 2022**.
8. **Whether Argentina and Chile buyers can use Ramp or Transak at all** via a foreign-currency
   card. Neither ARS nor CLP exists as a fiat rail at either provider. **MoonPay is the only
   provider that returns `isBuyAllowed: true` for Argentina and Chile from its own API.**
9. **Transak's real country coverage.** Its own sources contradict each other, and the headline
   number appears to have fallen from 63+ to 26+.
10. **The regulated-role question — and this is the one that needs a professional, not me.**
    None of the four providers' documentation states that a referring partner becomes a money
    transmitter, and the architecture (funds go provider → buyer's own wallet, never touching
    the owner) is the standard non-custodial referral pattern. **But "no provider says so" is
    not a legal opinion.** MiCA has applied in Spain since December 2024 and governs
    crypto-asset service providers; whether embedding a third-party on-ramp widget, and
    especially whether *taking a partner fee on it*, constitutes reception/transmission of
    orders is a question for a Spanish lawyer. **Setting the partner/ecosystem fee to 0%
    materially reduces this exposure** and is what I recommend regardless of provider.
    Third-party blog claims about non-custodial safe harbours were disregarded.

---

## 8. Recommendation

**Ship Option 0 now (a plain link, zero onboarding). When and if a real integration is
warranted, use Ramp Network.**

The reasoning is economic before it is technical. This product sells $1–$50 of pixels, and the
on-ramp's *minimum* is the binding constraint, not its percentage. **MoonPay is disqualified on
arithmetic**: a €20 minimum purchase carrying a €4.50 partner-referred minimum fee is a 22.5%
tax on the smallest transaction it will even permit, and a buyer wanting $5 of USDC cannot
transact at all — that is not a fee difference, it is a product the owner cannot sell.
**Coinbase is disqualified on funnel**: with Guest Checkout limited to the US/UK/Canada and
being retired, a Spanish or Latin American buyer must open a Coinbase account and pass KYC
before buying $3 of pixels, and its Latin American coverage and USDC-on-Solana path are both
behind an authenticated API I could not confirm. **Transak is disqualified on opacity**: it has
the lowest card minimum (€4), which is genuinely attractive, but it has removed its fee
percentages from public documentation, blocked the demo pricing API, and its own sources now
disagree about whether it covers 26 or 63 countries — that is not a foundation to build a
payments path on without a sales conversation first. **Ramp wins on every axis that matters
here**: a €6 minimum purchase and €2.49 minimum fee (half MoonPay's floor), a completely
published fee schedule, verified local-currency rails with USDC-on-Solana in Spain, Mexico,
Brazil, Colombia and Peru, PIX in Brazil at 2.90%, SEPA at 1.40%, free integration, a free
sandbox available before applying, and — uniquely — an explicit written invitation to apply
before the product is live, which is exactly this repo's situation. Its one real cost is
honest: **Ramp requires a registered legal entity and a commercially-owned domain, and the
owner is currently an individual with neither.** MoonPay's requirements might turn out to be
lighter — but they are unpublished, so betting on that is betting on an unknown, and MoonPay's
€20 floor kills it anyway. The residual gap on both Ramp and Transak is **Argentina and
Chile**, which have no local-currency rail; MoonPay covers them and is worth keeping as a
documented fallback link for those two markets specifically, precisely because its $20 minimum
matters less to a buyer who has no other option.

---

## 9. Exact steps remaining on the owner's side

### Phase 0 — ship this week, no prerequisites

| # | Step | Requires | Time |
|---|---|---|---|
| 0.1 | Add a "Need USDC on Solana?" link on the buy page pointing at Ramp's public buy page (`https://ramp.network/buy?defaultAsset=SOLANA_USDC`, verify the asset code renders correctly first). Buyer pastes their own address. | Nothing | 30 min |
| 0.2 | Add a one-line note next to it: minimum ≈€6, fees from 1.4% (SEPA) to 3.9% (card). Add a second link to MoonPay for Argentina and Chile buyers. | Nothing | 15 min |
| 0.3 | Instrument the click. If nobody clicks it, or clickers convert fine, **Phase 1 never needs to happen.** | Analytics already in the repo | 30 min |

**Phase 0 has no blockers. It requires no entity, no domain, no KYB, no API key, no agreement.**

### Phase 1 — Ramp partner integration, only if Phase 0 data justifies it

| # | Step | Requires | Time |
|---|---|---|---|
| 1.1 | **Register a legal entity in Spain.** *Autónomo* (sole trader) registration via Modelo 036/037 with Agencia Tributaria + RETA with Seguridad Social. **Confirm with Ramp first (step 1.3) that an autónomo satisfies "registered or incorporated"** — their doc names company certificates, which suggests an S.L. may be expected. An S.L. is notary + Registro Mercantil + €3,000 capital. | DNI/NIE, Spanish address, gestor or lawyer recommended | Autónomo: **1–3 days**. S.L.: **2–4 weeks** |
| 1.2 | **Buy the domain and deploy.** Register `milliondollarpage.fun` (a paid TLD — satisfies "commercially-owned domain, no free domains"), point DNS at Vercel, deploy the site publicly. | Card, Vercel account | **1 day** (DNS propagation) |
| 1.3 | **Email Ramp before doing 1.1**, describing the product plainly (pixels at a fixed price, not a game of chance, non-custodial, buyer pays from own wallet) and asking: does an autónomo qualify, and is a pixel-wall in a restricted sector? Contact: https://ramp.network/contact-sales | Nothing | **1–3 days** for a reply |
| 1.4 | **Publish Terms of Service and a visible support contact** on the live site. Ramp requires "explicit, easy-to-find terms and conditions/terms of use" *and* names visible customer support as a trust factor. | The site from 1.2 | **1 day** (needs legal review) |
| 1.5 | **Sign up for the Ramp sandbox and build the integration.** Free, no approval needed, can be done in parallel with everything above. | Nothing | **1 day** of work |
| 1.6 | **Submit the partnership / due-diligence application.** | Proof of registration from 1.1 (certified English translation if the document is in Spanish — Ramp requires this), live domain from 1.2, published ToS from 1.4 | Submission: 1 hour. Review: **1–2 days claimed by third-party sources; UNVERIFIED — budget 1–2 weeks** |
| 1.7 | **Receive production `hostApiKey`, whitelist the domain, swap the sandbox key, verify one real €6 purchase end-to-end** delivers USDC to a Solana address. | Approved application | **1 day** |
| 1.8 | **Set the partner fee to 0%** explicitly. Do not take a markup. | Ramp dashboard | 5 min |

**Realistic total for Phase 1: 3–6 weeks**, dominated by entity registration and the
due-diligence review. Steps 1.2, 1.4 and 1.5 can run fully in parallel with 1.1.

---

## 10. Blockers — called out separately

**Hard blockers for any merchant integration (all four providers):**

1. **No legal entity.** Ramp and Transak require one in writing. MoonPay's position is
   unpublished. Coinbase does not document an entity requirement for a CDP account, but its
   full-access review is undocumented. **This blocks Ramp, Transak, and probably MoonPay.**
2. **No domain and nothing deployed.** Ramp requires "a professional, public website or
   application, under a commercially-owned domain (no free domains)". Transak requires exact
   domain whitelisting. Coinbase's onboarding "will guide you through the process of verifying
   your domain". MoonPay requires IP allowlisting to go live. **This blocks all four.**
3. **No published Terms of Service.** Ramp requires them explicitly before going live.

**Soft blockers / things that will bite later:**

4. **MoonPay cannot test the USDC-on-Solana path** — `usdc_sol` has `supportsTestMode: false`.
   You can only test the SOL path and hope USDC behaves identically in production.
5. **Coinbase's widget cannot be iframed.** If the design assumes an in-page modal, Coinbase is
   architecturally excluded before any commercial question.
6. **Argentina and Chile have no local-currency rail on Ramp or Transak.** If either is a
   priority market, MoonPay is the only verified option — at a $20 minimum.
7. **The MiCA / regulated-role question is unresolved** (§7 item 10). Not a blocker for Phase 0,
   which is an ordinary outbound hyperlink. **Get a Spanish lawyer's view before Phase 1**,
   and keep the partner fee at 0%.

**Not a blocker:**

8. **Phase 0 has none of these problems.** A link to a public buy page requires no entity, no
   domain, no key, no agreement and no widget. That is why it is the recommendation for now.
