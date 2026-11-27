import { NextResponse } from "next/server";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const unauthorized = () => json({ error: "You need to log in first." }, 401);
export const notFound = (what = "Not found") => json({ error: what }, 404);
export const badRequest = (error: string) => json({ error }, 400);
