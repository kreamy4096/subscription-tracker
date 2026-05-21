import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const algorithm = "aes-256-gcm";

function getEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (secret) {
    return scryptSync(secret, "subtrack-credential-encryption", 32);
  }

  const legacyKey = process.env.ENCRYPTION_KEY;
  if (!legacyKey) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable is missing.",
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(legacyKey)) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters).",
    );
  }

  return Buffer.from(legacyKey, "hex");
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

export function decryptCredential({
  ciphertext,
  iv,
  tag,
}: {
  ciphertext: string;
  iv: string;
  tag: string;
}) {
  const decipher = createDecipheriv(
    algorithm,
    getEncryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
