import "server-only";

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

const realm = "SubTrack Pro";

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

export function requireBasicAuth(request: Request) {
  const expectedUsername = process.env.SUBTRACK_ADMIN_USERNAME;
  const expectedPassword = process.env.SUBTRACK_ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json(
      { error: "Server authentication is not configured" },
      { status: 503 },
    );
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

  if (
    !safeEqual(username, expectedUsername) ||
    !safeEqual(password, expectedPassword)
  ) {
    return unauthorized();
  }

  return null;
}

export function hasValidCronSecret(request: Request) {
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.headers.get("x-cron-secret");

  return typeof token === "string" && safeEqual(token, cronSecret);
}
