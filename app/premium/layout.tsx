import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { withTimeoutOrNull } from "@/lib/with-timeout";

export default async function PremiumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = await getTranslations("ImitationX.Premium");
  const supabase = await createClient();
  let userId: string | null = null;

  try {
    const authResult = await withTimeoutOrNull(supabase.auth.getUser(), 8000);
    userId = authResult?.data.user?.id ?? null;
  } catch {
    userId = null;
  }

  // Cloudflare 构建不包含 proxy（Node 中间件不被 OpenNext 支持），
  // 此处在布局层承担未登录重定向，与 gekaixing layout 保持一致。
  if (!userId) {
    redirect("/account");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/gekaixing" className="inline-flex items-center rounded-full p-2 transition-colors hover:bg-muted/70">
            <Image src="/logo.svg" width={52} height={12} alt="logo" className="dark:hidden" />
            <Image src="/logo-white.svg" width={52} height={12} alt="logo white" className="hidden dark:block" />
          </Link>
          <Link
            href="/gekaixing"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("backHome")}
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
