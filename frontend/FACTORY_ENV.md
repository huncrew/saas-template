## Factory (Frontend) env quickstart

The builder UI uses **live data** from the orchestrator whenever it’s configured.

### Required (local dev)

- **Auth (Clerk + Google)**:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - Recommended:
    - `CLERK_SIGN_IN_URL=/auth/signin`
    - `CLERK_SIGN_UP_URL=/auth/signup`
    - `CLERK_AFTER_SIGN_IN_URL=/projects`
    - `CLERK_AFTER_SIGN_UP_URL=/projects`

### Dev-only shortcut (recommended for local UI work)

- **Auth bypass** (lets you use `/projects/*` without requiring a signed-in user):
  - `FACTORY_DEV_NO_AUTH=1`
  - Optional UI banner: `NEXT_PUBLIC_FACTORY_DEV_NO_AUTH=1`

Note: you still need valid Clerk keys set (the UI uses Clerk components/hooks).

### Optional (recommended)

- **Orchestrator API** (enables live Projects/Builds data in `/projects/*`):
  - `ORCHESTRATOR_API_URL` (server-side) e.g. `http://localhost:8000`
  - `NEXT_PUBLIC_ORCHESTRATOR_API_URL` (optional, for UI banner/debug)

- **Backend API** (Lambda/API Gateway base URL used by AI, Stripe, etc.):
  - `BACKEND_API_URL` (recommended) e.g. `https://{api_id}.execute-api.{region}.amazonaws.com/{stage}`
  - `NEXT_PUBLIC_API_BASE_URL` (optional) e.g. `https://{api_id}.execute-api.{region}.amazonaws.com/{stage}`

### Example file

See `FACTORY_ENV.example` for a copy/paste template.

### One-command local dev (loads env automatically)

We ship a convenience runner:
- `npm run factory:dev`

It loads `FACTORY_ENV.local` (committed) and starts Next.js with the correct env vars.




