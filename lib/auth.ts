import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const realm = "SubTrack Pro";
export const sessionCookieName = "subtrack_session";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
    },
  });
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const legacyEncryptionKey = process.env.ENCRYPTION_KEY;

  if (!secret && !encryptionKey && !legacyEncryptionKey) {
    return null;
  }

  return secret || encryptionKey || legacyEncryptionKey;
}

function signSessionPayload(payload: string) {
  const secret = getSessionSecret();
  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(username: string) {
  const payload = `${username}:${Date.now()}`;
  const signature = signSessionPayload(payload);

  if (!signature) {
    return null;
  }

  return `${Buffer.from(payload, "utf8").toString("base64url")}.${signature}`;
}

export function isValidSessionToken(token: string | undefined) {
  if (!token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const [username, timestampText] = payload.split(":");
  const timestamp = Number.parseInt(timestampText ?? "", 10);
  const expectedSignature = signSessionPayload(payload);

  if (!username || !expectedSignature) {
    return false;
  }

  const maxAgeMs = 1000 * 60 * 60 * 12;
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > maxAgeMs) {
    return false;
  }

  return safeEqual(signature, expectedSignature);
}

function validateEnvCredentials(username: string, password: string) {
  const expectedUsername = process.env.SUBTRACK_ADMIN_USERNAME;
  const expectedPassword = process.env.SUBTRACK_ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  return (
    safeEqual(username, expectedUsername) &&
    safeEqual(password, expectedPassword)
  );
}

export async function validateAdminCredentials(username: string, password: string) {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername || !password) {
    return false;
  }

  const result = await query(
    `SELECT 1
     FROM app_users
     WHERE email_normalized = lower($1)
       AND password_hash = crypt($2, password_hash)
     LIMIT 1`,
    [normalizedUsername, password],
  );

  if (result.rowCount && result.rowCount > 0) {
    return true;
  }

  return validateEnvCredentials(username, password);
}

export function requireBasicAuth(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const sessionToken = cookieHeader
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);

  if (isValidSessionToken(sessionToken)) {
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorized();
  }

  const encoded = authorization.slice("Basic ".length);
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return unauthorized();
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (!validateEnvCredentials(username, password)) {
    return unauthorized();
  }

  return null;
}

export function hasValidCronSecret(request: Request) {
  const cronSecrets = [
    process.env.CRON_SECRET,
    process.env.REMINDER_CRON_SECRET,
  ].filter((value): value is string => Boolean(value));
  if (cronSecrets.length === 0) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.headers.get("x-cron-secret");

  return (
    typeof token === "string" &&
    cronSecrets.some((cronSecret) => safeEqual(token, cronSecret))
  );
}
