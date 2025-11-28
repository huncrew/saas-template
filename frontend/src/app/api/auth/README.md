# Auth route temporarily disabled

The original NextAuth handler (`route.ts`) was removed to unblock static HTML exports for S3/CloudFront deployment. The CloudOps MVP bypasses Cognito and Google auth flows for now, so the dashboard relies on anonymous access.

When we reinstate authentication, re-add a `route.ts` file that wraps `NextAuth(authOptions)` and ensure the build pipeline no longer runs with `NEXT_EXPORT=1`, or gate the handler behind a different deployment target (e.g. Lambda@Edge).

