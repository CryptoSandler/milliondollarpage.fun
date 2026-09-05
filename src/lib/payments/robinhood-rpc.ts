/**
 * The only place this repository talks to an EVM node.
 *
 * WHO CALLS THIS. `src/lib/payments/robinhood.ts`, and nothing else. It could
 * not hold this itself for the same reason `keys` split them: the URL carries a
 * provider key, so one module reaches the network and the verifier stays a pure
 * enough thing that its tests need not think about `fetch`.
 *
 * NOT `import "server-only"`, which is what the sibling project uses. That is a
 * package this repository does not have, and adding a dependency to state
 * something the build already PROVES is the wrong trade: `ROBINHOOD_RPC_URL` is
 * in `scripts/check-build-secrets.mts`'s list, so a build whose client output
 * contains the URL — key and all — fails, with a positive control behind it.
 * A measurement beats an assertion.
 *
 * BORROWED, DELIBERATELY, FROM `~/proyectos/keys/src/lib/chain/robinhood/rpc.ts`
 * — the same shape and the same refusal to propagate the node's own error text.
 * Two differences, and both are because this one settles money rather than
 * reading a tape:
 *
 *  - There is NO PUBLIC FALLBACK. `keys` falls back to the public testnet RPC
 *    when the variable is unset, which is right for discovery and wrong here: a
 *    payment verifier that silently reads a different node than the one the
 *    operator configured is a verifier nobody can reason about, and falling back
 *    to a TESTNET node from a mainnet deploy is the failure that makes free
 *    rectangles. Unset is an error.
 *  - Every call is bounded by a timeout, because a node that never answers must
 *    become a 503 the buyer can retry rather than a request that hangs until the
 *    platform kills it.
 */

const RPC_TIMEOUT_MS = 10_000;

export class RpcUnavailable extends Error {
  constructor(method: string) {
    // The METHOD and nothing else. The node's message is where a provider key
    // is most likely to appear, and a buyer learns nothing from it either way.
    super(`The chain could not be reached (${method}).`);
    this.name = "RpcUnavailable";
  }
}

export function rpcUrl(): string {
  const url = process.env.ROBINHOOD_RPC_URL?.trim();
  if (!url) {
    throw new Error(
      "ROBINHOOD_RPC_URL is not set. A payment is only settled after it has been read " +
        "back off the chain, and there is no node to read it from.",
    );
  }
  return url;
}

export async function evmCall<T = unknown>(method: string, params: unknown[]): Promise<T> {
  let response: Response;
  try {
    response = await fetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
  } catch {
    throw new RpcUnavailable(method);
  }
  if (!response.ok) throw new RpcUnavailable(method);

  const body = (await response.json()) as { result?: unknown; error?: unknown };
  if (body.error !== undefined) throw new RpcUnavailable(method);
  return body.result as T;
}
