import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const realm = "SubTrack Pro";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${realm}", charset="UTF-8"`,
    },
  });
}

export function proxy(request: NextRequest) {
  const expectedUsername = process.env.SUBTRACK_ADMIN_USERNAME;
  const expectedPassword = process.env.SUBTRACK_ADMIN_PASSWORD;
  const cronSecret = process.env.REMINDER_CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (
    request.nextUrl.pathname === "/api/reminders/send" &&
    cronSecret &&
    authorization === `Bearer ${cronSecret}`
  ) {
    return NextResponse.next();
  }

  if (!expectedUsername || !expectedPassword) {
    return NextResponse.json(
      { error: "Server authentication is not configured" },
      { status: 503 },
    );
  }

  if (!authorization?.startsWith("Basic ")) {
    return unauthorized();
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

  if (username !== expectedUsername || password !== expectedPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
