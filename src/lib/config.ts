/**
 * Environment readers.
 *
 * Each one throws rather than defaulting. A default for any of these is a
 * production deploy that looks healthy while doing the wrong thing.
 */

export function required(name: string, why: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set. ${why}`);
  return value;
}
