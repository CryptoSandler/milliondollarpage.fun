import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query } from "../../../lib/db";
import type { ValidatedContent } from "../../../lib/board/content";
import { attachContent } from "../../../lib/board/orders";
import { reserveRect } from "../../../lib/board/reserve";
import { testEvmWallet } from "../../../lib/wallet/__tests__/keypair";
import { challengeFor } from "./proof";
import { TRANSFER_TOPIC, USDG } from "../../../lib/payments/usdg";
import { POST as POST_CONFIRM } from "../orders/[id]/confirm/route";

/**
 * The Robinhood rail through the route that actually settles a rectangle.
 *
 * `robinhood.test.ts` next door proves the verifier refuses everything it
 * should; this proves the ROUTE reaches for it at all, and reaches for it
 * because of the ORDER'S OWN CHAIN rather than because of anything a caller
 * sent. Those are different failures: a verifier that is never called is as
 * good as no verifier, and the route is where that choice is made.
 *
 * The node is stubbed at `evmCall` — the one seam this repository has to a
 * chain — so what is exercised is every line between an HTTP request and
 * `markPaid`, including the EVM signature, the pair comparison and the UNIQUE
 * constraint that makes one transaction one rectangle.
 */
vi.mock("../../../lib/payments/robinhood-rpc", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/payments/robinhood-rpc")>(
    "../../../lib/payments/robinhood-rpc",
  );
  return { ...actual, evmCall: vi.fn() };
});
const { evmCall } = await import("../../../lib/payments/robinhood-rpc");
const node = vi.mocked(evmCall);

const TREASURY = "0x1111111111111111111111111111111111111111";
const CALLER = "203.0.113.44";
const HASH = `0x${"cd".repeat(32)}`;

const wallet = testEvmWallet();

function content(): ValidatedContent {
  const bytes = Buffer.from("fake-png-bytes");
  return {
    bytes,
    mime: "image/png",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    isAnimated: false,
    width: 100,
    height: 100,
    link: "https://example.com/",
    caption: "A caption",
    imageFit: "contain",
  };
}

let slot = 0;

/** A rectangle held by an EVM wallet, with its picture already attached. */
async function readyToPay(): Promise<{ id: string; owed: number }> {
  const held = await reserveRect(
    { x: 800 + slot++ * 20, y: 400, w: 10, h: 10 },
    { chain: "robinhood", address: wallet.address },
    CALLER,
  );
  await attachContent(held.id, wallet.address, content());
  return { id: held.id, owed: held.paymentBaseUnits! };
}

/** The transfer the buyer really made, as a node would report its receipt. */
function receipt(amount: number, over: { from?: string; to?: string } = {}) {
  const { from = wallet.address, to = TREASURY } = over;
  const topic = (address: string) => `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
  return {
    status: "0x1",
    blockNumber: "0x100",
    logs: [
      {
        address: USDG.address,
        topics: [TRANSFER_TOPIC, topic(from), topic(to)],
        data: `0x${amount.toString(16).padStart(64, "0")}`,
      },
    ],
  };
}

function chainAnswers(receiptValue: unknown, chainId: number = USDG.chainId) {
  node.mockImplementation(async (method: string) => {
    if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
    if (method === "eth_getTransactionReceipt") return receiptValue;
    // Far enough ahead that confirmations are never the reason a case fails.
    if (method === "eth_blockNumber") return "0x200";
    throw new Error(`unexpected ${method}`);
  });
}

/** The body the browser posts: a signed proof, plus the hash to look up. */
async function confirmBody(orderId: string, txHash: string = HASH) {
  const challenge = await challengeFor(orderId, "pay");
  return {
    nonce: challenge.nonce,
    chain: "robinhood",
    publicKey: wallet.address,
    signature: wallet.sign(challenge.message),
    txHash,
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/orders/x/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": CALLER },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.stubEnv("ROBINHOOD_PAYMENTS", "true");
  vi.stubEnv("ROBINHOOD_TREASURY_ADDRESS", TREASURY);
  // Off, deliberately: every case below has to go through the real verifier, and
  // a stub quietly answering for it is the one way this file could pass while
  // proving nothing.
  vi.stubEnv("ALLOW_STUB_PAYMENTS", "");
  node.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paying for a rectangle in USDG", () => {
  it("settles it, and writes the transaction hash as its signature", async () => {
    const { id, owed } = await readyToPay();
    chainAnswers(receipt(owed));

    const response = await POST_CONFIRM(request(await confirmBody(id)), ctx(id));
    expect(response.status).toBe(200);

    const rows = await query<{ status: string; payment_signature: string; owner_chain: string }>(
      "SELECT status, payment_signature, owner_chain FROM blocks WHERE id = $1",
      [id],
    );
    expect(rows[0]).toEqual({
      status: "paid",
      payment_signature: HASH.toLowerCase(),
      owner_chain: "robinhood",
    });
  });

  /**
   * THE CONSTRAINT, NOT THE CODE. Two rectangles, one transaction: the second
   * is refused by `blocks_payment_signature_unique`, which is a rule the
   * database holds and no request can talk its way past.
   */
  it("refuses to settle a second rectangle with the same transaction", async () => {
    const first = await readyToPay();
    chainAnswers(receipt(first.owed));
    expect((await POST_CONFIRM(request(await confirmBody(first.id)), ctx(first.id))).status).toBe(200);

    const second = await readyToPay();
    chainAnswers(receipt(second.owed));
    const response = await POST_CONFIRM(request(await confirmBody(second.id)), ctx(second.id));
    expect(response.status).toBe(409);

    const rows = await query<{ status: string }>("SELECT status FROM blocks WHERE id = $1", [
      second.id,
    ]);
    expect(rows[0].status).toBe("reserved");
  });

  it("refuses a transfer somebody else made, and leaves the hold standing", async () => {
    const { id, owed } = await readyToPay();
    chainAnswers(receipt(owed, { from: "0x3333333333333333333333333333333333333333" }));

    const response = await POST_CONFIRM(request(await confirmBody(id)), ctx(id));
    expect(response.status).toBe(409);
    const rows = await query<{ status: string }>("SELECT status FROM blocks WHERE id = $1", [id]);
    expect(rows[0].status).toBe("reserved");
  });

  it("refuses a payment read on the testnet", async () => {
    const { id, owed } = await readyToPay();
    chainAnswers(receipt(owed), USDG.testnetChainId);
    expect((await POST_CONFIRM(request(await confirmBody(id)), ctx(id))).status).toBe(409);
  });

  it("answers 503, not 409, when the node cannot be reached", async () => {
    const { id } = await readyToPay();
    node.mockRejectedValue(
      new (await import("../../../lib/payments/robinhood-rpc")).RpcUnavailable("eth_chainId"),
    );
    // The buyer's money may well be on the chain already; telling them the
    // payment was bad would be a lie with their money inside it.
    expect((await POST_CONFIRM(request(await confirmBody(id)), ctx(id))).status).toBe(503);
  });

  it("answers 400 for a body with no transaction hash in it", async () => {
    const { id } = await readyToPay();
    chainAnswers(null);
    const body = await confirmBody(id);
    delete (body as { txHash?: string }).txHash;
    expect((await POST_CONFIRM(request(body), ctx(id))).status).toBe(400);
  });

  /**
   * THE SIGNATURE STILL DECIDES WHOSE RECTANGLE IT IS. A real payment, read off
   * the chain, presented with a proof from another wallet: 403, and the money
   * has nothing to do with it.
   */
  it("refuses a proof from a different wallet even with the payment on the chain", async () => {
    const { id, owed } = await readyToPay();
    chainAnswers(receipt(owed));

    const stranger = testEvmWallet();
    const challenge = await challengeFor(id, "pay");
    const response = await POST_CONFIRM(
      request({
        nonce: challenge.nonce,
        chain: "robinhood",
        publicKey: stranger.address,
        signature: stranger.sign(challenge.message),
        txHash: HASH,
      }),
      ctx(id),
    );
    expect(response.status).toBe(403);
  });

  it("does not exist at all with the rail off and no stub", async () => {
    vi.stubEnv("ROBINHOOD_PAYMENTS", "");
    const { id } = await readyToPay();
    expect((await POST_CONFIRM(request(await confirmBody(id)), ctx(id))).status).toBe(404);
  });
});
