import "server-only";

import { createCipheriv, randomBytes, scryptSync } from "crypto";

const algorithm = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY environment variable is missing.");
  }

  return scryptSync(secret, "subtrack-credential-encryption", 32);
}

export function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
