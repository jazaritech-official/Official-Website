import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/** Reference IDs shown to visitors, e.g. JT-20261001-4K7QP2 (server generated). */
export function createReferenceId(date = new Date()) {
  const stamp = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("");

  const bytes = crypto.randomBytes(6);
  let suffix = "";
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];

  return `JT-${stamp}-${suffix}`;
}

export default createReferenceId;
