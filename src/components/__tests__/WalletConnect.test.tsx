import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WalletConnect from "../WalletConnect";
import type { WalletsState } from "../useWallets";

/**
 * The control that now offers two chains, rendered.
 *
 * WHY A RENDER TEST AND NOT AN END-TO-END ONE. The browser harness already
 * drives connect, sign and pay against a mock Solana wallet, and it proves the
 * flow. What it cannot cheaply prove is what a buyer holding wallets on BOTH
 * chains is shown — a second mock, announced over EIP-6963, is a fair amount of
 * machinery to assert three strings. These are the three strings.
 *
 * The risk this covers is real and recent: the control was rewritten from one
 * list to two, and the failure it would produce is a buyer connecting the wrong
 * chain and finding out three signed steps later, when the rectangle they hold
 * cannot be paid for by the wallet in front of them.
 */
function state(over: Partial<WalletsState> = {}): WalletsState {
  return {
    choices: [],
    ready: true,
    connected: null,
    connecting: null,
    notice: null,
    connect: () => {},
    disconnect: () => {},
    ...over,
  };
}

function render(over: Partial<WalletsState> = {}) {
  const props = state(over);
  return renderToStaticMarkup(
    <WalletConnect
      choices={props.choices}
      connected={props.connected}
      connecting={props.connecting}
      notice={props.notice}
      disabled={false}
      needed={false}
      onConnect={() => {}}
      onDisconnect={() => {}}
    />,
  );
}

const PHANTOM = { key: "solana:Phantom", name: "Phantom", chain: "solana" as const, icon: null, usable: true };
const HOOD = {
  key: "robinhood:uuid-1",
  name: "Robinhood Wallet",
  chain: "robinhood" as const,
  icon: null,
  usable: true,
};

describe("choosing a wallet", () => {
  it("names the chain beside each one when both are on offer", () => {
    const html = render({ choices: [PHANTOM, HOOD] });
    expect(html).toContain("Phantom");
    expect(html).toContain("Robinhood Wallet");
    expect(html).toContain("Solana");
    expect(html).toContain("Robinhood Chain");
  });

  /**
   * A reader with one Solana wallet does not need to be taught that a chain
   * exists. The label is information only when there is a choice to make.
   */
  it("says nothing about chains when every wallet is on one", () => {
    const html = render({ choices: [PHANTOM, { ...PHANTOM, key: "solana:Solflare", name: "Solflare" }] });
    expect(html).toContain("Solflare");
    expect(html).not.toContain("Robinhood Chain");
  });

  it("keeps the one-wallet fast path, with the wallet's name as the accessible one", () => {
    const html = render({ choices: [HOOD] });
    // `purchase-e2e` reaches for this exact attribute, and a screen reader is
    // told this instead of the glyph.
    expect(html).toContain('aria-label="Connect Robinhood Wallet"');
  });

  it("offers somewhere to go when there is no wallet at all", () => {
    const html = render({ choices: [] });
    expect(html).toContain("Phantom");
    expect(html).toContain("Buying is signed");
  });
});

describe("once connected", () => {
  it("says which chain is holding the key, not only which wallet", () => {
    const html = render({
      choices: [HOOD],
      connected: {
        name: "Robinhood Wallet",
        address: "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01",
        chain: "robinhood",
        evm: null,
        solana: null,
      },
    });
    expect(html).toContain("Robinhood Chain");
    expect(html).toContain("0xAbCdEf0123456789aBcDeF0123456789AbCdEf01");
  });

  it("says Solana for a Solana connection", () => {
    const html = render({
      choices: [PHANTOM],
      connected: {
        name: "Phantom",
        address: "BuyerPubkey1111111111111111111111111111111",
        chain: "solana",
        evm: null,
        solana: null,
      },
    });
    expect(html).toContain("Solana");
    expect(html).not.toContain("Robinhood Chain");
  });
});
