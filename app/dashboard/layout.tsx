import type React from "react";

import DashboardShell from "@/components/dashboard-shell";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps): React.JSX.Element {
  return <DashboardShell>{children}</DashboardShell>;
}
