"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Square } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export default function LiveEndStreamButton({ streamId }: { streamId: string }) {
  const t = useTranslations("ImitationX.Live");
  const router = useRouter();
  const [ending, setEnding] = useState(false);

  const handleEnd = async () => {
    if (!window.confirm(t("confirmEnd"))) {
      return;
    }

    setEnding(true);
    try {
      const response = await fetch(`/api/live/streams/${streamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ENDED" }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(t("endSuccess"));
        router.refresh();
      } else {
        toast.error(result.error || t("endFailed"));
      }
    } catch (error) {
      console.error("Failed to end stream:", error);
      toast.error(t("endFailed"));
    } finally {
      setEnding(false);
    }
  };

  return (
    <Button
      variant="destructive"
      className="gap-1.5 rounded-full"
      onClick={() => void handleEnd()}
      disabled={ending}
    >
      {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 fill-current" />}
      {t("endStream")}
    </Button>
  );
}
