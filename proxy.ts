import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const realm = "SubTrack Pro";
const sessionCookieName = "subtrack_session";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
    },
  });
}

async function signSessionPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hasValidSession(request: NextRequest, secret: string) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return false;
  }

  let payload = "";
  try {
    payload = atob(encodedPayload.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return false;
  }
  const [username, timestampText] = payload.split(":");
  const timestamp = Number.parseInt(timestampText ?? "", 10);

  if (!username) {
    return false;
  }

  const maxAgeMs = 1000 * 60 * 60 * 12;
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > maxAgeMs) {
    return false;
  }

  const expectedSignature = await signSessionPayload(payload, secret);
  return signature === expectedSignature;
}

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/api/login";
}

function apiUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function proxy(request: NextRequest) {
  const expectedUsername = process.env.SUBTRACK_ADMIN_USERNAME;
  const expectedPassword = process.env.SUBTRACK_ADMIN_PASSWORD;
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  const sessionSecret =
    process.env.AUTH_SESSION_SECRET || process.env.CREDENTIAL_ENCRYPTION_KEY;
  const authorization = request.headers.get("authorization");
  const pathname = request.nextUrl.pathname;

  if (
    pathname === "/api/reminders/send" &&
    cronSecret &&
    authorization === `Bearer ${cronSecret}`
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!sessionSecret) {
    return NextResponse.json(
      { error: "Server authentication is not configured" },
      { status: 503 },
    );
  }

  if (await hasValidSession(request, sessionSecret)) {
    return NextResponse.next();
  }

  if (!authorization?.startsWith("Basic ")) {
    if (pathname.startsWith("/api/")) {
      return apiUnauthorized();
    }

    return NextResponse.redirect(new URL("/login", request.url));
  }

  let decoded = "";
  try {
    decoded = atob(authorization.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return unauthorized();
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (
    !expectedUsername ||
    !expectedPassword ||
    username !== expectedUsername ||
    password !== expectedPassword
  ) {
    return pathname.startsWith("/api/") ? apiUnauthorized() : unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
