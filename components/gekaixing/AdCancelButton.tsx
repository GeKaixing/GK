"use client"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AdCancelButton({
    adId,
    confirmText,
}: {
    adId: string;
    confirmText: string;
}) {
    const t = useTranslations("ImitationX.Ads");
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    async function cancel() {
        setLoading(true);
        try {
            const res = await fetch(`/api/ads/${adId}`, { method: "PATCH" });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error ?? "Failed");
            }
            toast.success(t("cancelSuccess"));
            setOpen(false);
            router.refresh();
        } catch {
            toast.error(t("cancelFailed"));
        } finally {
            setLoading(false);
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={loading}>
                    {t("cancel")}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("cancelConfirm")}</AlertDialogTitle>
                    <AlertDialogDescription>{confirmText}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>{t("close")}</AlertDialogCancel>
                    <AlertDialogAction onClick={cancel} disabled={loading}>
                        {t("cancel")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
