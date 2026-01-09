export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Serverless-first: dashboard is navigable without auth in preview/dev mode.
  // Production auth is handled by your chosen provider (Clerk) at the app level.
  return children;
}