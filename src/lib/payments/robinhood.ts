import type { Order } from "../board/orders";
import { evmCall, RpcUnavailable } from "./robinhood-rpc";
import { TRANSFER_TOPIC, USDG, isEvmAddress, treasuryAddress } from "./usdg";

/**
 * Reads a payment back off Robinhood Chain and says whether it settles an order.
 *
 * WHO CALLS THIS. `src/app/api/orders/[id]/confirm/route.ts`, in place of
 * `stubVerifyPayment`. The route cannot do this itself: everything below is a
 * decision about what a transaction has to LOOK like before a rectangle changes
 * hands for ever, and a route is the wrong place for a rule that has to be read
 * against `DECISIONS.md`'s eight-point contract line by line.
 *
 * ## The eight points, and where each one is answered
 *
 *  1. **Not forgeable or replayable.** The buyer sends a real transfer and hands
 *     back its hash; nothing here trusts a claim. Replay is closed twice — by
 *     `blocks_payment_signature_unique`, a UNIQUE constraint on the hash, and by
 *     the per-order fraction below, which no second order shares.
 *  2. **Amount, destination and network are read FROM THE CHAIN.** The amount
 *     comes out of the `Transfer` event's data, the destination out of its third
 *     topic, and the network out of `eth_chainId` on our own node. The request
 *     body contributes ONE string: the hash to look up.
 *  3. **The chain is verified server-side.** `eth_chainId` must be 4663. A
 *     testnet payment cannot settle a mainnet order, because a testnet node
 *     answers 46630 and this refuses before it reads a single log.
 *  4. **Presenting is separated from controlling.** The `from` of the transfer
 *     must be the order's own owner, so a stranger who copies somebody else's
 *     hash out of an explorer credits nothing — the pixelwar C-1 class, closed
 *     by the strongest available check rather than by the fraction alone.
 *  5. **One transaction settles at most one order**, by database constraint:
 *     `markPaid` writes the hash into `payment_signature`, which is UNIQUE.
 *  6. **A payment landing after the reservation expired has a defined outcome.**
 *     Not decided here: `markPaid` throws `OrderExpired`, the route answers 410,
 *     and this module deliberately does not paper over it — a late payment is a
 *     refund conversation, not a rectangle.
 *  7. **The stub path cannot be reached in a deployed environment**, unchanged:
 *     `assertStubPaymentsNotInProduction` in `src/instrumentation.ts`.
 *  8. **Rate limiting** is the route's, as it already is for every write.
 */

/**
 * How many blocks must sit on top before a transfer is money.
 *
 * Robinhood Chain is an Arbitrum Orbit L2: its sequencer orders transactions
 * and a receipt exists almost immediately, but that ordering is only as final
 * as the batch that has not yet been posted to its parent chain.
 *
 * // ponytail: six is a judgement, not a measurement — it is a few seconds on
 * // an L2 with sub-second blocks, and it is the number to raise if this chain
 * // is ever observed to reorganise more deeply than that. The place to raise
 * // it is here, and nothing else has to change.
 */
export const PAYMENT_CONFIRMATIONS = 6;

/**
 * One, as a bigint.
 *
 * Written out because this repository targets ES2017, where the `1n` literal is
 * a compile error. Amounts stay bigints all the same: a `Transfer`'s data is 32
 * bytes, and a number would silently round anything above nine quadrillion base
 * units into equality with something it is not.
 */
const ONE = BigInt(1);

/** `0x` and sixty-four hex characters. Nothing else is a transaction hash. */
const TX_HASH_SHAPE = /^0x[0-9a-fA-F]{64}$/;

export type PaymentVerdict =
  | { ok: true; signature: string }
  | {
      ok: false;
      /** Which failure, so the route can pick a status code. */
      reason:
        | "malformed"
        | "wrong_chain"
        | "not_found"
        | "reverted"
        | "unconfirmed"
        | "no_matching_transfer"
        | "unavailable";
      /** ONE sentence, for the buyer, naming the number where there is one. */
      message: string;
    };

type Receipt = {
  status: string;
  blockNumber: string;
  logs: { address: string; topics: string[]; data: string }[];
} | null;

/** Hex quantity to a bigint, refusing anything that is not one. */
function quantity(hex: unknown): bigint | null {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]+$/.test(hex)) return null;
  return BigInt(hex);
}

/** The last twenty bytes of a 32-byte topic, which is how an address is logged. */
function addressFromTopic(topic: string): string | null {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(26)}`;
}

/** Addresses are the same account in either case; comparison folds it. */
function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Which chain and which token count as payment.
 *
 * A PARAMETER WITH A DEFAULT, AND NEVER AN ENVIRONMENT VARIABLE. The rehearsal
 * on testnet 46630 has to exercise this exact function — a rehearsal against a
 * copy of the logic rehearses the copy — so the two facts that differ there are
 * passed in. They are not read from the environment, because "which chain
 * counts as real money" is the one decision a deploy's configuration must not
 * be able to get wrong quietly.
 */
export type Rail = { chainId: number; token: string };

export const MAINNET_RAIL: Rail = { chainId: USDG.chainId, token: USDG.address };

export async function verifyUsdgPayment(
  order: Order,
  txHash: unknown,
  rail: Rail = MAINNET_RAIL,
): Promise<PaymentVerdict> {
  if (typeof txHash !== "string" || !TX_HASH_SHAPE.test(txHash)) {
    return {
      ok: false,
      reason: "malformed",
      message: "That is not a transaction hash from Robinhood Chain.",
    };
  }

  /*
    THE ORDER'S OWN OWNER, AND ONLY AN EVM ONE. A rectangle held on Solana is
    not paid for on Robinhood Chain: there is no address on this chain that
    proved it, so there is nothing to compare the transfer's `from` against. The
    refusal is here rather than at the route because it is a fact about the
    verifier — this one reads EVM logs — and not about how the request arrived.
  */
  if (order.ownerChain !== "robinhood" || !isEvmAddress(order.ownerAddress)) {
    return {
      ok: false,
      reason: "no_matching_transfer",
      message: "This rectangle is not held by a wallet on Robinhood Chain.",
    };
  }

  const treasury = treasuryAddress();

  try {
    /*
      THE NETWORK, FIRST AND FROM OUR OWN NODE. Nothing else is read until this
      passes: a testnet node answers 46630, and every check below it would pass
      perfectly well against a transfer that cost nobody anything.
    */
    const chainId = quantity(await evmCall<string>("eth_chainId", []));
    if (chainId === null || chainId !== BigInt(rail.chainId)) {
      return {
        ok: false,
        reason: "wrong_chain",
        message: "This payment was not read on Robinhood Chain, so it was not accepted.",
      };
    }

    const receipt = await evmCall<Receipt>("eth_getTransactionReceipt", [txHash]);
    if (!receipt) {
      return {
        ok: false,
        reason: "not_found",
        message: "That transaction has not been included in a block yet. Try again in a moment.",
      };
    }

    if (quantity(receipt.status) !== ONE) {
      return {
        ok: false,
        reason: "reverted",
        message: "That transaction failed on the chain, so nothing was transferred.",
      };
    }

    const minedAt = quantity(receipt.blockNumber);
    const head = quantity(await evmCall<string>("eth_blockNumber", []));
    if (minedAt === null || head === null) {
      return {
        ok: false,
        reason: "unavailable",
        message: "This payment could not be checked just now. Try again in a moment.",
      };
    }
    // The block it landed in counts as the first confirmation.
    const confirmations = head - minedAt + ONE;
    if (confirmations < BigInt(PAYMENT_CONFIRMATIONS)) {
      const missing = BigInt(PAYMENT_CONFIRMATIONS) - confirmations;
      return {
        ok: false,
        reason: "unconfirmed",
        message: `That payment needs ${missing} more block${missing === ONE ? "" : "s"} before it counts. Try again in a moment.`,
      };
    }

    /*
      THE TRANSFER, AND ALL FOUR OF ITS FACTS AT ONCE.

      A transaction can carry any number of logs, including transfers of other
      tokens to other people, so the match is on the conjunction and never on
      one field at a time: emitted BY the USDG contract, a `Transfer`, TO the
      treasury, FROM this order's owner, for EXACTLY the amount this order was
      quoted — fraction included, which is what stops one payment being pointed
      at a second, cheaper rectangle.
    */
    /*
      A SAFE INTEGER OR NOTHING. `paymentBaseUnits` is a JavaScript number, and
      at six decimals the whole wall costs 10^12 base units — a thousandth of
      the way to 2^53, so this can never fire for a real order. It fires for a
      corrupted one, and the alternative to refusing is comparing a value that
      has already been rounded, which is how two different amounts become equal.

      // ponytail: the real fix is a bigint all the way from the column, and the
      // column is already `bigint`. It is not worth the churn while the ceiling
      // is nine thousand times the price of the entire wall; the day a rail
      // takes a token with eighteen decimals, it is.
    */
    if (!Number.isSafeInteger(order.paymentBaseUnits)) {
      return {
        ok: false,
        reason: "no_matching_transfer",
        message: "This rectangle's amount could not be read. Nothing was settled.",
      };
    }
    const owed = BigInt(order.paymentBaseUnits);
    const paid = (receipt.logs ?? []).some((log) => {
      if (!log || !sameAddress(log.address ?? "", rail.token)) return false;
      if (!Array.isArray(log.topics) || log.topics.length < 3) return false;
      if ((log.topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) return false;

      const from = addressFromTopic(log.topics[1]);
      const to = addressFromTopic(log.topics[2]);
      if (!from || !to) return false;
      if (!sameAddress(to, treasury)) return false;
      if (!sameAddress(from, order.ownerAddress)) return false;

      return quantity(log.data) === owed;
    });

    if (!paid) {
      return {
        ok: false,
        reason: "no_matching_transfer",
        message: "That transaction did not send this rectangle's exact amount to us.",
      };
    }

    // The hash is the signature this order is settled by, and the UNIQUE
    // constraint on that column is what makes one transaction one rectangle.
    return { ok: true, signature: txHash.toLowerCase() };
  } catch (error) {
    if (error instanceof RpcUnavailable) {
      return {
        ok: false,
        reason: "unavailable",
        message: "This payment could not be checked just now. Try again in a moment.",
      };
    }
    throw error;
  }
}
