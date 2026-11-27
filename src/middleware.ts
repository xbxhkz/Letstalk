import { NextResponse, type NextRequest } from "next/server";

/** Gives every visitor a stable anonymous id so watch history can personalise For You before login. */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("lt_anon")) {
    res.cookies.set("lt_anon", crypto.randomUUID(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export const config = { matcher: ["/((?!_next/|uploads/|favicon).*)"] };
