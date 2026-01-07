import { NextResponse } from "next/server";
import type { APIResponse } from "@/types";
import { auth } from "@clerk/nextjs/server";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, data } satisfies APIResponse<T>, init);
}

export function jsonErr(message: string, status = 400, init?: ResponseInit) {
  return NextResponse.json(
    { success: false, error: message } satisfies APIResponse<never>,
    { status, ...(init || {}) }
  );
}

export function orchestratorBaseUrl(): string | null {
  return process.env.ORCHESTRATOR_API_URL || process.env.NEXT_PUBLIC_ORCHESTRATOR_API_URL || null;
}

export function devNoAuthEnabled(): boolean {
  return process.env.FACTORY_DEV_NO_AUTH === "1";
}

export async function getUserId(): Promise<string | null> {
  if (devNoAuthEnabled()) return "dev_user";
  const { userId } = await auth();
  return userId || null;
}




