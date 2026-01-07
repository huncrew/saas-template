import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher(["/projects(.*)", "/dashboard(.*)"]);

export default clerkMiddleware((auth, req) => {
  // Dev escape hatch: allows working on the builder UI without auth configured.
  if (process.env.FACTORY_DEV_NO_AUTH === "1") {
    return NextResponse.next();
  }

  if (isProtectedRoute(req)) {
    return (async () => {
      await auth.protect();
      return NextResponse.next();
    })();
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Run middleware on all routes except static files and Next internals.
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};