/**
 * Asks the chain what USDG is, and compares the answer with what we wrote down.
 *
 * WHO RUNS THIS: a person, before the rail is turned on and after any change to
 * `src/lib/payments/usdg.ts` — `npx tsx scripts/usdg-check.mts`. Not the suite:
 * the suite must not depend on a node being reachable, and a test that hits a
 * live RPC fails for reasons that have nothing to do with the code.
 *
 * WHY IT EXISTS. The token at `USDG.address` is an ERC-1967 PROXY. Its issuer
 * can replace the implementation behind it without the address changing, so
 * `decimals: 6` is a fact that was true on 2026-09-04 and is not a fact that is
 * true for ever. Six decimals is what makes the price the buyer is quoted and
 * the integer the chain must show the SAME NUMBER; if that ever changed under
 * us, every amount this site asks for would be wrong by a factor of a thousand
 * and nothing else in the repository would notice.
 *
 *   ROBINHOOD_RPC_URL=… npx tsx scripts/usdg-check.mts
 *
 * Pass `--testnet` to read `ROBINHOOD_TESTNET_RPC_URL` instead, which is the
 * form the 46630 rehearsal uses. The token there is a different deployment, so
 * `ROBINHOOD_TOKEN_ADDRESS` overrides which contract is asked; the shape checks
 * — a symbol, a name, six decimals — are the same either way, which is the
 * point of rehearsing against it.
 */

const TESTNET = process.argv.includes("--testnet");
const RPC = (TESTNET ? process.env.ROBINHOOD_TESTNET_RPC_URL : process.env.ROBINHOOD_RPC_URL)?.trim();

if (!RPC) {
  console.error(
    `${TESTNET ? "ROBINHOOD_TESTNET_RPC_URL" : "ROBINHOOD_RPC_URL"} is not set, so there is ` +
      "no node to ask. Nothing was checked.",
  );
  process.exit(2);
}

/** Selectors, which are the first four bytes of the keccak of the signature. */
const SELECTOR = {
  decimals: "0x313ce567",
  symbol: "0x95d89b41",
  name: "0x06fdde03",
  totalSupply: "0x18160ddd",
} as const;

// Repeated rather than imported: `usdg.ts` is `server-only`-adjacent and this
// script is what CHECKS it, so reading the value under test out of the file
// under test would make the comparison vacuous.
const EXPECTED = {
  address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  chainId: 4663,
  decimals: 6,
  symbol: "USDG",
  name: "Global Dollar",
} as const;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`rpc http ${response.status} on ${method}`);
  const body = (await response.json()) as { result?: T; error?: unknown };
  if (body.error !== undefined) throw new Error(`rpc error on ${method}`);
  return body.result as T;
}

const TOKEN = process.env.ROBINHOOD_TOKEN_ADDRESS?.trim() || EXPECTED.address;

async function call(data: string): Promise<string> {
  const result = await rpc<string>("eth_call", [{ to: TOKEN, data }, "latest"]);
  // `0x` is what a node returns for a call to an address with no code. It is
  // not a token answering oddly; it is nothing being there, and saying so is
  // more use than a decode error twenty lines later.
  if (!result || result === "0x") {
    console.error(
      `There is no contract at ${TOKEN} on this node. On testnet the token is a different ` +
        "deployment — set ROBINHOOD_TOKEN_ADDRESS to the one the rehearsal uses.",
    );
    process.exit(2);
  }
  return result;
}

/** An ABI-encoded `string` return: offset, length, then the bytes. */
function decodeString(hex: string): string {
  const body = hex.slice(2);
  const length = Number.parseInt(body.slice(64, 128), 16);
  return Buffer.from(body.slice(128, 128 + length * 2), "hex").toString("utf8");
}

const chainId = Number.parseInt(await rpc<string>("eth_chainId", []), 16);
const decimals = Number.parseInt(await call(SELECTOR.decimals), 16);
const symbol = decodeString(await call(SELECTOR.symbol));
const name = decodeString(await call(SELECTOR.name));
const supply = BigInt(await call(SELECTOR.totalSupply));

const found = { chainId, decimals, symbol, name };
const failures: string[] = [];

// On testnet the chain id is deliberately different and the token may not be
// this contract at all; everything else still has to hold on mainnet.
if (!TESTNET && chainId !== EXPECTED.chainId) {
  failures.push(`chain id is ${chainId}, expected ${EXPECTED.chainId}`);
}
if (decimals !== EXPECTED.decimals) {
  failures.push(
    `decimals is ${decimals}, expected ${EXPECTED.decimals} — every amount this site quotes ` +
      "would be wrong by a factor of ten to that difference",
  );
}
if (symbol !== EXPECTED.symbol) failures.push(`symbol is "${symbol}", expected "${EXPECTED.symbol}"`);
if (name !== EXPECTED.name) failures.push(`name is "${name}", expected "${EXPECTED.name}"`);

console.log(`  ${TOKEN} on chain ${chainId}`);
console.log(`  symbol ${found.symbol} · name ${found.name} · decimals ${found.decimals}`);
console.log(`  total supply ${(Number(supply) / 10 ** decimals).toLocaleString("en-US")}`);

if (failures.length > 0) {
  console.error("\nWHAT THE CHAIN SAYS AND THE CODE SAYS DO NOT AGREE:");
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}

console.log("\n  the chain agrees with src/lib/payments/usdg.ts.");
