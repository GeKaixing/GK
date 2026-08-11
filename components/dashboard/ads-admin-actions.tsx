"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AdStatus } from "@/generated/prisma/enums";

type Action = "approve" | "pause" | "resume" | "end" | "reject";

// 每个状态可执行的操作
const AVAILABLE: Record<AdStatus, Action[]> = {
  PENDING_PAYMENT: ["reject"],
  PAID: ["approve", "reject"],
  ACTIVE: ["pause", "end", "reject"],
  PAUSED: ["resume", "end", "reject"],
  ENDED: [],
  REJECTED: [],
  CANCELLED: [],
};

const VARIANTS: Record<Action, "default" | "secondary" | "destructive" | "outline"> = {
  approve: "default",
  pause: "secondary",
  resume: "default",
  end: "outline",
  reject: "destructive",
};

export default function AdsAdminActions({
  adId,
  status,
}: {
  adId: string;
  status: AdStatus;
}) {
  const t = useTranslations("Dashboard.ads");
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);

  async function run(action: Action) {
    setPending(action);
    try {
      const res = await fetch(`/api/admin/ads/${adId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed");
      }
      toast.success(t("actions.success"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  const actions = AVAILABLE[status] ?? [];

  return (
    <div className="flex flex-wrap gap-1">
      {actions.map((action) => (
        <Button
          key={action}
          variant={VARIANTS[action]}
          size="sm"
          disabled={pending !== null}
          onClick={() => {
            if (!window.confirm(t(`actions.${action}Confirm`))) {
              return;
            }
            void run(action);
          }}
        >
          {t(`actions.${action}`)}
        </Button>
      ))}
    </div>
  );
}
