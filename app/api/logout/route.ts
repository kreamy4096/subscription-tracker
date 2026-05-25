import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    expires: new Date(0),
    path: "/",
  });

  return response;
}
