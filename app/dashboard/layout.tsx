import type React from "react";

import { redirect } from "next/navigation";

import DashboardShell from "@/components/dashboard-shell";
import { UserRole } from "@/generated/prisma/enums";
import { getDashboardViewer } from "@/lib/dashboard/viewer";
import { prisma } from "@/lib/prisma";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: DashboardLayoutProps): Promise<React.JSX.Element> {
  const { userId } = await getDashboardViewer();

  let isAdmin = false;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    isAdmin = user?.role === UserRole.ADMIN;
  }

  if (!isAdmin) {
    redirect("/gekaixing");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
