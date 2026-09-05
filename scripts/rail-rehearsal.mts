/**
 * Runs the REAL payment verifier against a REAL transaction on testnet 46630.
 *
 * WHO RUNS THIS: a person, before the rail is switched on — and again after any
 * change to `src/lib/payments/robinhood.ts`. `CLAUDE.md` requires a rehearsal
 * before anything about how money moves changes, and this is the half of that
 * rehearsal a script can do. The other half is somebody watching a wallet
 * prompt, and no script does that.
 *
 * WHY IT CALLS THE REAL FUNCTION. `verifyUsdgPayment` takes the chain and the
 * token as a parameter with a mainnet default, precisely so this can hand it
 * the testnet pair. A rehearsal that re-implemented the checks would prove that
 * the copy works.
 *
 * ## It rehearses the REFUSALS too, and that is the point
 *
 * A rehearsal that only shows a pass proves that one transaction verifies. What
 * has to be true is that everything else does NOT, so the same real receipt is
 * re-read four more times with one fact moved each time — a base unit more, a
 * different treasury, a different payer, the mainnet chain id — and every one of
 * them has to be refused. Those four are the checks the wall's money rests on,
 * and here they are being made against a real node's real answer rather than
 * against a fixture somebody wrote to pass.
 *
 * ## What it needs
 *
 *   ROBINHOOD_TESTNET_RPC_URL   a node on 46630 (the public one is fine)
 *   ROBINHOOD_TOKEN_ADDRESS     the ERC-20 whose Transfer counts
 *   --to     <address>          the treasury, i.e. the transfer's recipient
 *   --from   <address>          the wallet that sent it
 *   --amount <base units>       the exact integer it sent
 *   --tx     <hash>             the transaction to read back
 *
 * The four values after the token are read off a transfer that already exists
 * on that chain. That is deliberate: it needs no faucet, no deployment and no
 * funded account, and it is REAL DATA — a receipt this repository did not write
 * and cannot have tailored to itself.
 */
import type { Order } from "../src/lib/board/orders";
import { verifyUsdgPayment, type Rail } from "../src/lib/payments/robinhood";

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const TESTNET_CHAIN_ID = 46630;
const MAINNET_CHAIN_ID = 4663;

const rpc = process.env.ROBINHOOD_TESTNET_RPC_URL?.trim();
const token = process.env.ROBINHOOD_TOKEN_ADDRESS?.trim();
const to = flag("to");
const from = flag("from");
const amount = flag("amount");
const tx = flag("tx");

const missing = Object.entries({
  ROBINHOOD_TESTNET_RPC_URL: rpc,
  ROBINHOOD_TOKEN_ADDRESS: token,
  "--to": to,
  "--from": from,
  "--amount": amount,
  "--tx": tx,
})
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error("Nothing was rehearsed. These are not set:");
  for (const name of missing) console.error(`  - ${name}`);
  process.exit(2);
}

/*
  THE VERIFIER READS ITS NODE FROM `ROBINHOOD_RPC_URL`, and on purpose it has no
  fallback — so the rehearsal POINTS that variable at the testnet node for the
  length of this process rather than teaching the verifier a second way to find
  one. A verifier with two ways to choose a node is a verifier that can choose
  wrongly in production.
*/
process.env.ROBINHOOD_RPC_URL = rpc;

const testnet: Rail = { chainId: TESTNET_CHAIN_ID, token: token! };

function order(over: { from?: string; amount?: string } = {}): Order {
  return {
    ownerChain: "robinhood",
    ownerAddress: over.from ?? from!,
    paymentBaseUnits: Number(over.amount ?? amount),
  } as Order;
}

/** One run of the real verifier, with the treasury it should compare against. */
async function attempt(
  label: string,
  expected: "settles" | "refused",
  treasury: string,
  ord: Order,
  rail: Rail,
): Promise<boolean> {
  process.env.ROBINHOOD_TREASURY_ADDRESS = treasury;
  const verdict = await verifyUsdgPayment(ord, tx, rail);
  const got = verdict.ok ? "settles" : "refused";
  const ok = got === expected;
  const detail = verdict.ok ? verdict.signature : `${verdict.reason}: ${verdict.message}`;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label.padEnd(46)} ${got.padEnd(8)} ${detail}`);
  return ok;
}

console.log(`\n  chain ${TESTNET_CHAIN_ID} · token ${token}`);
console.log(`  tx    ${tx}`);
console.log(`  ${from} -> ${to}, ${amount} base units\n`);

const results = [
  await attempt("the transfer as it really happened", "settles", to!, order(), testnet),
  await attempt(
    "one base unit more than was sent",
    "refused",
    to!,
    order({ amount: String(BigInt(amount!) + BigInt(1)) }),
    testnet,
  ),
  await attempt(
    "the same transfer, a different treasury",
    "refused",
    "0x000000000000000000000000000000000000dEaD",
    order(),
    testnet,
  ),
  await attempt(
    "presented by somebody who did not send it",
    "refused",
    to!,
    order({ from: "0x000000000000000000000000000000000000dEaD" }),
    testnet,
  ),
  await attempt(
    "read as if this node were mainnet",
    "refused",
    to!,
    order(),
    { chainId: MAINNET_CHAIN_ID, token: token! },
  ),
];

const failed = results.filter((ok) => !ok).length;
if (failed > 0) {
  console.error(`\n  ${failed} of ${results.length} did not do what it must. The rail is not safe to turn on.`);
  process.exit(1);
}

console.log(`\n  ${results.length} of ${results.length}: one transfer settles, and four near misses do not.`);
