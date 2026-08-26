/**
 * Base58, the alphabet Solana writes addresses and signatures in.
 *
 * Called by `signature.ts`, which is the only place in the application that
 * needs it: a Solana address is a base58-encoded raw 32-byte ed25519 public
 * key, and a wallet's signature is 64 base58-encoded bytes, so both have to
 * come back to bytes before `node:crypto` can look at them. `signature.ts`
 * could not do this itself without becoming two unrelated things in one file,
 * and this half has an exact, boring specification worth pinning on its own.
 *
 * `base58Encode` is the direction the application does not need yet — nothing
 * here produces an address or a signature — and it is kept because the test
 * fixtures build both from a generated keypair, and because the wallet
 * adapter that arrives with the real signing path hands back raw bytes that
 * have to be spelled this way to be sent.
 *
 * Copied from `outbid-tokens/src/lib/base58.ts` rather than written again,
 * with one correction: that version seeds the decode accumulator with a
 * single zero byte, which makes every leading '1' produce one zero byte too
 * many. A Solana address whose first byte is zero — perfectly legal, and
 * roughly one address in 256 — would have decoded to 33 bytes and been
 * rejected as malformed. The accumulator starts empty here.
 *
 * No dependency: this is sixty lines of integer arithmetic, and `bs58` would
 * be a package in the tree for it.
 */

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const INDEX: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) INDEX[ALPHABET[i]] = i;

/**
 * Decodes a base58 string to bytes, or null when it is not base58 at all.
 *
 * Null rather than a throw: every caller is a trust boundary handling a
 * string somebody sent us, and "this is not base58" is an ordinary answer
 * there rather than an exceptional one.
 */
export function base58Decode(input: string): Uint8Array | null {
  if (input.length === 0) return null;

  const bytes: number[] = [];
  for (const char of input) {
    const value = INDEX[char];
    if (value === undefined) return null;

    let carry = value;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Every leading '1' is a leading zero byte, which the arithmetic above
  // cannot carry because zero times anything is still zero.
  for (const char of input) {
    if (char !== ALPHABET[0]) break;
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

/** The other direction: bytes to base58. */
export function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }

  let leadingZeros = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    leadingZeros += ALPHABET[0];
  }

  return leadingZeros + digits.reverse().map((digit) => ALPHABET[digit]).join("");
}
