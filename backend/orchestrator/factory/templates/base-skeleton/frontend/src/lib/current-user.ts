export function getCurrentUserId(): string | undefined {
  // Factory preview/dev mode: allow navigating the template without auth.
  if (process.env.NEXT_PUBLIC_FACTORY_DEV_NO_AUTH === "1") return "dev_user";
  return undefined;
}



