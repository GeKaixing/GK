"use client";

import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function PremiumCardClient() {
  const t = useTranslations("ImitationX.Premium");
  const [dismissed, setDismissed] = useState(false);

  const handleDismiss = () => {
    // 立即隐藏；cookie 写入交给后台请求（best-effort）
    setDismissed(true);
    void fetch("/api/premium/dismiss", { method: "POST" }).catch(() => {});
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-lg font-bold">{t("title")}</p>
        <div className="flex shrink-0 items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-500" />
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t("dismiss")}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <Link
        href="/premium"
        className="mt-3 block w-full rounded-full bg-primary py-2 text-center text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {t("subscribe")}
      </Link>
    </div>
  );
}
