import { describe, expect, it } from "vitest";
import {
  SOLANA_SIGN_MESSAGE,
  STANDARD_CONNECT,
  STANDARD_DISCONNECT,
  accountToSignWith,
  canSignChallenges,
  shortAddress,
  usableWallets,
  type ReadableWallet,
} from "../standard";

/**
 * The registry's decisions, driven by plain objects.
 *
 * The whole reason `standard.ts` knows nothing about React or `window` is so
 * these can be asserted here rather than eyeballed in a browser with three
 * extensions installed. What NEEDS a browser — that the events fire, that a
 * connect resolves, that a signature verifies — is in
 * `src/components/__tests__/purchase-e2e.test.ts`, driven through headless
 * Chrome against a real server. Between the two there is nothing about this
 * feature proved by mocking itself.
 */

function wallet(over: Partial<ReadableWallet> = {}): ReadableWallet {
  return {
    name: "Mock",
    icon: "data:image/png;base64,AA==",
    chains: ["solana:mainnet"],
    features: { [STANDARD_CONNECT]: {}, [SOLANA_SIGN_MESSAGE]: {} },
    ...over,
  };
}

describe("canSignChallenges", () => {
  it("takes a wallet that can connect and sign a message on a Solana chain", () => {
    expect(canSignChallenges(wallet())).toBe(true);
  });

  it("takes a wallet on any Solana cluster, because a signed sentence names no chain", () => {
    // Deliberate, and the one place this differs from a payment filter: a
    // devnet-only wallet proves a key exactly as well as a mainnet one. When
    // money moves, THAT batch matches an exact chain.
    expect(canSignChallenges(wallet({ chains: ["solana:devnet"] }))).toBe(true);
    expect(canSignChallenges(wallet({ chains: ["solana:localnet", "eip155:1"] }))).toBe(true);
  });

  it("refuses a wallet for another chain family entirely", () => {
    expect(canSignChallenges(wallet({ chains: ["eip155:1"] }))).toBe(false);
    expect(canSignChallenges(wallet({ chains: [] }))).toBe(false);
  });

  it("refuses a wallet that cannot be connected to, whatever else it offers", () => {
    // Without `standard:connect` there is no account, so `solana:signMessage`
    // is unreachable however loudly it is advertised.
    expect(canSignChallenges(wallet({ features: { [SOLANA_SIGN_MESSAGE]: {} } }))).toBe(false);
  });

  it("refuses a wallet that can connect but cannot sign a message", () => {
    // Including one that can sign TRANSACTIONS: this product never asks for
    // one, and a wallet that offers only those cannot answer a challenge.
    expect(
      canSignChallenges(
        wallet({
          features: { [STANDARD_CONNECT]: {}, "solana:signAndSendTransaction": {} },
        }),
      ),
    ).toBe(false);
  });

  it("never throws on whatever an extension put in the registry", () => {
    // A page that throws while enumerating extensions shows none of the
    // wallets that registered correctly, so every one of these has to be an
    // ordinary `false` rather than an exception.
    const rubbish: unknown[] = [
      { ...wallet(), chains: null },
      { ...wallet(), features: null },
      { ...wallet(), features: "not an object" },
      { ...wallet(), chains: [null, 7] },
      {},
      null,
      undefined,
    ];
    for (const item of rubbish) {
      expect(canSignChallenges(item as ReadableWallet)).toBe(false);
    }
  });
});

describe("usableWallets", () => {
  it("keeps registry order and does not rank anything", () => {
    const list = [wallet({ name: "Second" }), wallet({ name: "First" })];
    expect(usableWallets(list).map((found) => found.name)).toEqual(["Second", "First"]);
  });

  it("drops the wallets that cannot sign, and keeps the ones that can", () => {
    const list = [
      wallet({ name: "Signs" }),
      wallet({ name: "Ethereum", chains: ["eip155:1"] }),
      wallet({ name: "Watch only", features: { [STANDARD_CONNECT]: {} } }),
    ];
    expect(usableWallets(list).map((found) => found.name)).toEqual(["Signs"]);
  });

  it("deduplicates an extension that registered twice", () => {
    // Real behaviour: some extensions register eagerly and again on app-ready,
    // and a list reading "Phantom, Phantom" reads as our bug rather than theirs.
    expect(usableWallets([wallet(), wallet()])).toHaveLength(1);
  });

  it("reports whether the wallet can be told to forget us", () => {
    const [without] = usableWallets([wallet()]);
    expect(without.canDisconnect).toBe(false);

    const [withIt] = usableWallets([
      wallet({
        features: { [STANDARD_CONNECT]: {}, [STANDARD_DISCONNECT]: {}, [SOLANA_SIGN_MESSAGE]: {} },
      }),
    ]);
    expect(withIt.canDisconnect).toBe(true);
  });

  it("answers with an empty list rather than throwing when handed nothing", () => {
    expect(usableWallets([])).toEqual([]);
    expect(usableWallets(undefined as unknown as ReadableWallet[])).toEqual([]);
  });
});

describe("accountToSignWith", () => {
  it("prefers the account that says it can sign messages", () => {
    const accounts = [
      { address: "quiet" },
      { address: "loud", features: [SOLANA_SIGN_MESSAGE] },
    ];
    expect(accountToSignWith(accounts)?.address).toBe("loud");
  });

  it("falls back to the first account when none of them declares anything", () => {
    // Permissive on purpose, and argued in the module: the WALLET already
    // declared the feature or it would not be in this list, and the cost of
    // trying is a refusal the buyer already has a sentence for.
    expect(accountToSignWith([{ address: "only" }, { address: "other" }])?.address).toBe("only");
  });

  it("answers null for a connect that produced nothing", () => {
    expect(accountToSignWith([])).toBeNull();
    expect(accountToSignWith(undefined)).toBeNull();
  });
});

describe("shortAddress", () => {
  it("keeps the two ends a person actually checks", () => {
    expect(shortAddress("11111111111111111111111111111112")).toBe("1111…1112");
  });

  it("leaves a short string alone rather than making it longer", () => {
    expect(shortAddress("abc")).toBe("abc");
  });
});
