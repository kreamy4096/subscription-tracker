import { NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieName,
  validateAdminCredentials,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: unknown;
      password?: unknown;
    };
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!(await validateAdminCredentials(username, password))) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const token = createSessionToken(username);
    if (!token) {
      return NextResponse.json(
        { error: "Server authentication is not configured" },
        { status: 503 },
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("API Error in POST /api/login:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
