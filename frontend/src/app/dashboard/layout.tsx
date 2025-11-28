import CloudOpsShell from "@/components/dashboard-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CloudOpsShell>{children}</CloudOpsShell>;
}