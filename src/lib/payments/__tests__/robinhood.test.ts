import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../../board/orders";
import { PAYMENT_CONFIRMATIONS, verifyUsdgPayment } from "../robinhood";
import { TRANSFER_TOPIC, USDG } from "../usdg";

/**
 * The money path, attacked rather than described.
 *
 * Every case here is a transaction somebody could really present — the right
 * amount to the wrong address, the right transfer from the wrong wallet, the
 * right everything on the wrong network — and the requirement is that the
 * rectangle does NOT change hands. A test that asserted the happy path alone
 * would pass against a verifier that returned `ok` for anything with a receipt.
 *
 * The node is stubbed at `evmCall`, which is the only place this repository
 * touches a chain. That seam is the point of `robinhood-rpc.ts` being its own
 * module: the verifier is then a pure function of what a node said, and what a
 * node said is exactly what an attacker controls.
 */
vi.mock("../robinhood-rpc", async () => {
  const actual = await vi.importActual<typeof import("../robinhood-rpc")>("../robinhood-rpc");
  return { ...actual, evmCall: vi.fn() };
});
const { evmCall, RpcUnavailable } = await import("../robinhood-rpc");
const node = vi.mocked(evmCall);

const TREASURY = "0x1111111111111111111111111111111111111111";
const BUYER = "0x2222222222222222222222222222222222222222";
const STRANGER = "0x3333333333333333333333333333333333333333";
const HASH = `0x${"ab".repeat(32)}`;

/** The amount this order was quoted: a round total plus its own fraction. */
const OWED = 400_000_137;

/** An address as a 32-byte topic, which is how the log carries it. */
function topic(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function transferLog(over: Partial<{ address: string; from: string; to: string; amount: number }> = {}) {
  const { address = USDG.address, from = BUYER, to = TREASURY, amount = OWED } = over;
  return {
    address,
    topics: [TRANSFER_TOPIC, topic(from), topic(to)],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
  };
}

/** Chain id, then the receipt, then the head block: the three calls, in order. */
function answers(receipt: unknown, over: { chainId?: number; head?: number; minedAt?: number } = {}) {
  const { chainId = USDG.chainId, head = 1000, minedAt = 1000 - (PAYMENT_CONFIRMATIONS - 1) } = over;
  node.mockImplementation(async (method: string) => {
    if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
    if (method === "eth_getTransactionReceipt") {
      if (receipt === null) return null;
      return { status: "0x1", blockNumber: `0x${minedAt.toString(16)}`, ...(receipt as object) };
    }
    if (method === "eth_blockNumber") return `0x${head.toString(16)}`;
    throw new Error(`unexpected ${method}`);
  });
}

function order(over: Partial<Order> = {}): Order {
  return {
    ownerChain: "robinhood",
    ownerAddress: BUYER,
    paymentBaseUnits: OWED,
    ...over,
  } as Order;
}

beforeEach(() => {
  vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", TREASURY);
  node.mockReset();
});

describe("a payment that settles a rectangle", () => {
  it("is one transfer of the exact amount, from the owner, to the treasury", async () => {
    answers({ logs: [transferLog()] });
    expect(await verifyUsdgPayment(order(), HASH)).toEqual({
      ok: true,
      // Lowercased, because the hash becomes `payment_signature` and that
      // column's UNIQUE constraint is what makes one transaction one order —
      // two casings of one hash must not be two rows.
      signature: HASH.toLowerCase(),
    });
  });

  it("is found among other logs rather than only as the first one", async () => {
    answers({
      logs: [
        transferLog({ address: "0x9999999999999999999999999999999999999999" }),
        transferLog({ to: STRANGER }),
        transferLog(),
      ],
    });
    expect((await verifyUsdgPayment(order(), HASH)).ok).toBe(true);
  });

  it("accepts the owner's address in either case, as a wallet may return it", async () => {
    answers({ logs: [transferLog()] });
    const shouty = `0x${BUYER.slice(2).toUpperCase()}`;
    expect((await verifyUsdgPayment(order({ ownerAddress: shouty }), HASH)).ok).toBe(true);
  });
});

describe("a payment that does not", () => {
  it("refuses a hash that is not a hash, before it calls a node at all", async () => {
    for (const bad of ["", "0x", HASH.slice(0, -1), `${HASH}00`, "not-a-hash", 4663]) {
      const verdict = await verifyUsdgPayment(order(), bad);
      expect(verdict.ok, JSON.stringify(bad)).toBe(false);
      expect(verdict.ok === false && verdict.reason).toBe("malformed");
    }
    expect(node).not.toHaveBeenCalled();
  });

  /**
   * THE TESTNET CASE, which is the one that makes rectangles free.
   *
   * A transfer on 46630 costs nothing to make and looks identical in every
   * other respect. The chain is checked FIRST and from our own node, so this
   * refuses before a single log is read.
   */
  it("refuses a payment read on the testnet, and reads nothing else", async () => {
    answers({ logs: [transferLog()] }, { chainId: USDG.testnetChainId });
    const verdict = await verifyUsdgPayment(order(), HASH);
    expect(verdict.ok === false && verdict.reason).toBe("wrong_chain");
    expect(node).toHaveBeenCalledTimes(1);
  });

  it("refuses a transaction that is not in a block yet", async () => {
    answers(null);
    const verdict = await verifyUsdgPayment(order(), HASH);
    expect(verdict.ok === false && verdict.reason).toBe("not_found");
  });

  it("refuses a transaction that reverted, receipt and all", async () => {
    answers({ status: "0x0", logs: [transferLog()] });
    const verdict = await verifyUsdgPayment(order(), HASH);
    expect(verdict.ok === false && verdict.reason).toBe("reverted");
  });

  it("refuses one that is too new, and says how many blocks are missing", async () => {
    answers({ logs: [transferLog()] }, { head: 1000, minedAt: 1000 });
    const verdict = await verifyUsdgPayment(order(), HASH);
    expect(verdict.ok === false && verdict.reason).toBe("unconfirmed");
    expect(verdict.ok === false && verdict.message).toContain(String(PAYMENT_CONFIRMATIONS - 1));
  });

  it("refuses the exact amount sent to somebody else", async () => {
    answers({ logs: [transferLog({ to: STRANGER })] });
    expect((await verifyUsdgPayment(order(), HASH)).ok).toBe(false);
  });

  /**
   * THE pixelwar C-1 CLASS: presenting a transaction is not controlling the
   * wallet that made it. A stranger who copies this hash out of an explorer and
   * hands it in for their own hold gets nothing, because the transfer's `from`
   * is not their address.
   */
  it("refuses a real payment presented by somebody who did not make it", async () => {
    answers({ logs: [transferLog({ from: STRANGER })] });
    expect((await verifyUsdgPayment(order(), HASH)).ok).toBe(false);
  });

  it("refuses a transfer of a different token for the same amount", async () => {
    answers({ logs: [transferLog({ address: "0x9999999999999999999999999999999999999999" })] });
    expect((await verifyUsdgPayment(order(), HASH)).ok).toBe(false);
  });

  /**
   * ONE BASE UNIT, WHICH IS THE WHOLE POINT OF THE FRACTION. The amount is not
   * "about right": it is the exact integer this order was quoted, so a payment
   * made for one rectangle cannot be pointed at a cheaper one.
   */
  it("refuses an amount that is one base unit short, and one too many", async () => {
    for (const amount of [OWED - 1, OWED + 1]) {
      answers({ logs: [transferLog({ amount })] });
      expect((await verifyUsdgPayment(order(), HASH)).ok, String(amount)).toBe(false);
    }
  });

  /**
   * FOUND BY THE TESTNET REHEARSAL, against a real transfer.
   *
   * `paymentBaseUnits` is a JavaScript number. The first rehearsal pointed at a
   * token with eighteen decimals and a transfer of 2.98 x 10^16 base units,
   * which is past 2^53 — so the amount rounded on the way into the comparison
   * and a transfer that really happened was refused. It cannot happen to a real
   * order here: six decimals put the whole wall at 10^12. It can happen to a
   * corrupted one, and the answer to a number that has already been rounded is
   * to refuse rather than to compare it.
   */
  it("refuses an amount too large to be represented exactly, rather than rounding it", async () => {
    answers({ logs: [transferLog()] });
    const verdict = await verifyUsdgPayment(order({ paymentBaseUnits: 2 ** 53 + 2 }), HASH);
    expect(verdict.ok).toBe(false);
  });

  it("refuses an order held on another chain, without calling a node", async () => {
    const verdict = await verifyUsdgPayment(
      order({ ownerChain: "solana", ownerAddress: "BuyerPubkey111111111111111111111111111111" }),
      HASH,
    );
    expect(verdict.ok).toBe(false);
    expect(node).not.toHaveBeenCalled();
  });

  it("says the chain could not be reached rather than that the payment was bad", async () => {
    node.mockRejectedValue(new RpcUnavailable("eth_chainId"));
    const verdict = await verifyUsdgPayment(order(), HASH);
    // The distinction is the whole reason this reason exists: one is a 503 the
    // buyer retries, the other is a 409 that tells them their money is not here.
    expect(verdict.ok === false && verdict.reason).toBe("unavailable");
  });
});

describe("the treasury", () => {
  it("refuses to verify anything at all when it is not set", async () => {
    vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", "");
    answers({ logs: [transferLog()] });
    await expect(verifyUsdgPayment(order(), HASH)).rejects.toThrow(/ROBINHOOD_TREASURY_ADDRESS/);
  });

  it("refuses a malformed one, rather than comparing against a typo", async () => {
    vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", "0xnothex");
    answers({ logs: [transferLog()] });
    await expect(verifyUsdgPayment(order(), HASH)).rejects.toThrow(/EVM address/);
  });
});
