import { NextResponse } from "next/server";

export function middleware() {
  // Auth is disabled for the MVP so we always continue.
  return NextResponse.next();
        }

export const config = {
  matcher: [],
};