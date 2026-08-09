import type React from "react";

import DashboardShell from "@/components/dashboard-shell";
import { withTimeoutOrNull } from "@/lib/with-timeout";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps): Promise<React.JSX.Element> {
  // Cloudflare 构建不包含 proxy（Node 中间件不被 OpenNext 支持），
  // 此处在布局层承担未登录重定向，保证两平台行为一致。
  const supabase = await createClient();
  let userId: string | null = null;

  try {
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    const user = authResult?.data.user ?? null;
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  if (!userId) {
    redirect("/account");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
