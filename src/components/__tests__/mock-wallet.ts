import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { base58Encode } from "../../lib/wallet/base58";

/**
 * A Wallet Standard wallet with a real ed25519 key, injected into a page.
 *
 * WHO CALLS THIS: `purchase-e2e.test.ts` next door, and nothing else. It is
 * the counterpart to `src/lib/wallet/__tests__/keypair.ts`: that file makes a
 * key for a test that signs in Node, and this one makes a key for a test that
 * signs in a browser, through the registry, exactly as an extension would.
 *
 * **The signature it produces is genuinely verifiable**, which is the whole
 * point of it. `consumeChallenge` on the server rebuilds the sentence from the
 * challenge row and runs `verifySignature` over it, and none of that is
 * mocked, stubbed or bypassed anywhere in the run — so a test that reaches the
 * receipt has proved the browser signed the exact bytes the server asked for
 * with the key it claims. A fake that returned constant bytes would prove that
 * the buttons are clickable and nothing else.
 *
 * The private key goes into the page as PKCS#8 and is signed with by
 * `crypto.subtle`, which does Ed25519 natively — so there is no crypto library
 * in the injected script either, and nothing to disagree with `node:crypto` on
 * the server side of the same signature.
 */

export type MockWallet = {
  /** base58, exactly as a Solana wallet reports it and as the server decodes it. */
  address: string;
  /** The script to inject before the page's own scripts run. */
  script: string;
};

/** The last 32 bytes of a DER SPKI encoding are the key itself. */
function rawPublicKey(publicKey: KeyObject): Uint8Array {
  const der = publicKey.export({ format: "der", type: "spki" });
  return new Uint8Array(der.subarray(der.length - 32));
}

/**
 * A one-pixel transparent PNG, as a data URL.
 *
 * The wallet's icon, and nothing more: `WalletConnect` renders whatever the
 * extension hands it, so the test exercises the branch that draws one rather
 * than the branch that skips it.
 */
const ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/**
 * Makes a keypair and the script that registers it as a wallet.
 *
 * `name` is what the Connect button says, so a test can inject two wallets and
 * tell them apart.
 */
export function mockWallet(name = "Mock Wallet"): MockWallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const address = base58Encode(rawPublicKey(publicKey));
  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  const rawPublic = Buffer.from(rawPublicKey(publicKey)).toString("base64");

  // Written as a string rather than a function that gets stringified, because
  // what runs here is not this file's TypeScript and pretending otherwise
  // (`.toString()` on a closure) hides exactly that.
  const script = `
(() => {
  const bytes = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const KEY = crypto.subtle.importKey("pkcs8", bytes(${JSON.stringify(pkcs8)}), { name: "Ed25519" }, false, ["sign"]);

  const account = {
    address: ${JSON.stringify(address)},
    publicKey: bytes(${JSON.stringify(rawPublic)}),
    chains: ["solana:mainnet", "solana:devnet"],
    // Declared, so \`accountToSignWith\` takes the declared branch here and the
    // fallback branch stays covered by the pure tests rather than by neither.
    features: ["solana:signMessage"],
    label: ${JSON.stringify(name)},
  };

  // Empty until \`standard:connect\` is called, which is what makes a connect
  // mean something: a page that could read the address without one would not
  // be exercising the prompt a real wallet shows.
  let accounts = [];

  const wallet = {
    version: "1.0.0",
    name: ${JSON.stringify(name)},
    icon: ${JSON.stringify(ICON)},
    chains: ["solana:mainnet", "solana:devnet"],
    get accounts() { return accounts; },
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: async () => {
          accounts = [account];
          return { accounts };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => { accounts = []; },
      },
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async (...inputs) => {
          if (accounts.length === 0) throw new Error("Not connected.");
          const key = await KEY;
          const outputs = [];
          for (const input of inputs) {
            if (input.account.address !== account.address) throw new Error("Unknown account.");
            const signature = await crypto.subtle.sign({ name: "Ed25519" }, key, input.message);
            outputs.push({ signedMessage: input.message, signature: new Uint8Array(signature) });
          }
          return outputs;
        },
      },
    },
  };

  // Both directions of the protocol, which is what a real extension does: shout
  // once in case the app is already listening, and answer the app's own
  // announcement in case it is not. This page's hook only listens after
  // hydration, so it is the second that fires — and the first is here so the
  // test is driving the shape a wallet actually ships rather than half of it.
  /*
    A PAGE CAN ASK FOR NO WALLET AT ALL. "?nowallet" makes this script do
    nothing, which is the only way a suite that injects a wallet into every
    navigation can also test the page a visitor without one sees. It is a hook
    in the TEST's own wallet, not in the product: nothing under src/app or
    src/components knows this parameter exists.
  */
  if (location.search.indexOf("nowallet") >= 0) return;

  const announce = (api) => api.register(wallet);
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: announce }));
  window.addEventListener("wallet-standard:app-ready", (event) => announce(event.detail));
})();
`;

  return { address, script };
}
