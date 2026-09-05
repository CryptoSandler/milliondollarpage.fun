import { describe, expect, it, vi } from "vitest";
import {
  CHAIN_UNKNOWN_TO_WALLET,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_CHAIN_PARAMS,
  USER_REJECTED,
  erc20TransferData,
  personalSign,
  sendErc20Transfer,
  switchToRobinhood,
  type Eip1193Provider,
} from "../evm-provider";

/**
 * The browser half of the rail, where getting it wrong costs a buyer money.
 *
 * Three things are checked here and nothing else is worth checking: that the
 * calldata is the calldata (a wrong offset moves a different amount to a
 * different address), that the chain guard actually confirms rather than
 * assumes, and that `personal_sign` gets its two arguments the right way round.
 *
 * The provider is a stub because that is what a provider is: an object with
 * `request`. Nothing here needs a browser.
 */
function provider(answers: Record<string, unknown | (() => unknown)>): Eip1193Provider & {
  calls: { method: string; params?: unknown[] }[];
} {
  const calls: { method: string; params?: unknown[] }[] = [];
  return {
    calls,
    async request(args) {
      calls.push(args);
      const answer = answers[args.method];
      if (typeof answer === "function") return (answer as () => unknown)();
      if (answer === undefined) throw new Error(`no stub for ${args.method}`);
      return answer;
    },
  };
}

function rejection(code: number): () => never {
  return () => {
    throw Object.assign(new Error("no"), { code });
  };
}

describe("the transfer calldata", () => {
  /**
   * The selector is `keccak256("transfer(address,uint256)")`'s first four
   * bytes, and it is not computed here on purpose: a test that derived it the
   * same way the code does would agree with the code about a wrong answer.
   * `0xa9059cbb` is the ERC-20 selector every explorer prints.
   */
  it("is the ERC-20 selector and two left-padded words", () => {
    const data = erc20TransferData("0x1111111111111111111111111111111111111111", BigInt(1_000_042));
    expect(data.slice(0, 10)).toBe("0xa9059cbb");
    expect(data.slice(10, 74)).toBe(`${"0".repeat(24)}1111111111111111111111111111111111111111`);
    expect(BigInt(`0x${data.slice(74)}`)).toBe(BigInt(1_000_042));
    // 4 bytes plus two 32-byte words, in hex, plus "0x".
    expect(data).toHaveLength(2 + 8 + 128);
  });

  it("lower-cases a checksummed address rather than encoding its capitals", () => {
    const shouty = erc20TransferData("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01", BigInt(1));
    const quiet = erc20TransferData("0xabcdef0123456789abcdef0123456789abcdef01", BigInt(1));
    expect(shouty).toBe(quiet);
  });

  it("carries no ether, because this moves a token", async () => {
    const wallet = provider({ eth_sendTransaction: "0xdead" });
    await sendErc20Transfer(
      wallet,
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333",
      "0x1111111111111111111111111111111111111111",
      BigInt(5),
    );
    const [sent] = wallet.calls[0].params as [{ to: string; value?: string }];
    // The token is the `to` — a wallet prompt showing a transfer TO the
    // treasury with a value on it would be a different transaction entirely.
    expect(sent.to).toBe("0x3333333333333333333333333333333333333333");
    expect(sent.value).toBeUndefined();
  });
});

describe("the 4663 guard", () => {
  it("does nothing when the wallet is already there", async () => {
    const wallet = provider({ eth_chainId: "0x1237" });
    await switchToRobinhood(wallet);
    expect(wallet.calls.map((call) => call.method)).toEqual(["eth_chainId"]);
  });

  it("asks to switch when it is somewhere else", async () => {
    const wallet = provider({ eth_chainId: "0x1", wallet_switchEthereumChain: null });
    await switchToRobinhood(wallet);
    expect(wallet.calls[1]).toEqual({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1237" }],
    });
  });

  /**
   * 4902 is "this wallet has never heard of that chain", which is the ordinary
   * case for Robinhood Chain in a wallet that is not Robinhood's. The network
   * is then offered — and the parameters offered are the verified ones, which
   * this asserts by value, because they get written into somebody else's wallet
   * and stay there.
   */
  it("offers to add the network, with the verified parameters, and confirms the switch", async () => {
    const chainIds = ["0x1", "0x1237"];
    const wallet = provider({
      eth_chainId: () => chainIds.shift() ?? "0x1237",
      wallet_switchEthereumChain: rejection(CHAIN_UNKNOWN_TO_WALLET),
      wallet_addEthereumChain: null,
    });
    await switchToRobinhood(wallet);
    const added = wallet.calls.find((call) => call.method === "wallet_addEthereumChain");
    expect(added?.params).toEqual([ROBINHOOD_CHAIN_PARAMS]);
    expect(Number(BigInt(ROBINHOOD_CHAIN_PARAMS.chainId))).toBe(ROBINHOOD_CHAIN_ID);
  });

  /**
   * SOME WALLETS ADD A NETWORK WITHOUT MOVING TO IT. The guard re-reads the
   * chain after adding and switches again if it has to; without that, the very
   * next call signs a transfer on whatever network the wallet stayed on.
   */
  it("switches again when adding the network did not move the wallet", async () => {
    const chainIds = ["0x1", "0x1"];
    const switches: unknown[] = [];
    const wallet = provider({
      eth_chainId: () => chainIds.shift() ?? "0x1",
      wallet_switchEthereumChain: () => {
        switches.push(1);
        if (switches.length === 1) throw Object.assign(new Error("no"), { code: CHAIN_UNKNOWN_TO_WALLET });
        return null;
      },
      wallet_addEthereumChain: null,
    });
    await switchToRobinhood(wallet);
    expect(switches).toHaveLength(2);
  });

  it("reports a refused network as a refusal, not as a failure", async () => {
    const wallet = provider({
      eth_chainId: "0x1",
      wallet_switchEthereumChain: rejection(CHAIN_UNKNOWN_TO_WALLET),
      wallet_addEthereumChain: rejection(USER_REJECTED),
    });
    await expect(switchToRobinhood(wallet)).rejects.toThrow("chain-add-rejected");
  });
});

describe("personal_sign", () => {
  /**
   * MESSAGE FIRST, ADDRESS SECOND. Reversed, MetaMask treats the address as the
   * message and returns a signature over the wrong bytes — which verifies
   * against nothing and looks, from the server, exactly like a forgery.
   */
  it("sends the hex message first and the address second", async () => {
    const wallet = provider({ personal_sign: "0xsig" });
    await personalSign(wallet, "0x1111111111111111111111111111111111111111", "prove it");
    const [message, address] = wallet.calls[0].params as [string, string];
    expect(Buffer.from(message.slice(2), "hex").toString("utf8")).toBe("prove it");
    expect(address).toBe("0x1111111111111111111111111111111111111111");
  });
});

describe("discovery", () => {
  it("returns nothing outside a browser rather than throwing", async () => {
    const { discoverEvmWallets } = await import("../evm-provider");
    const window = globalThis.window;
    // @ts-expect-error deliberately removing it, which is what the server is.
    delete globalThis.window;
    try {
      expect(await discoverEvmWallets()).toEqual([]);
    } finally {
      globalThis.window = window;
      vi.unstubAllGlobals();
    }
  });
});
