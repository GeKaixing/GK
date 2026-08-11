"use client"

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AD_CURRENCY, AD_DAILY_PRICE_CENTS, AD_DURATION_DAYS, adPriceCents } from "@/lib/ads/config";
import { formatCents } from "@/lib/ads/format";

export interface AdCampaignPost {
    id: string;
    content: string;
    createdAt: string;
}

export default function AdCampaignForm({
    posts,
    initialPostId,
}: {
    posts: AdCampaignPost[];
    initialPostId?: string;
}) {
    const t = useTranslations("ImitationX.Ads");
    const [selectedPostId, setSelectedPostId] = useState(initialPostId ?? posts[0]?.id ?? "");
    const [durationDays, setDurationDays] = useState<number>(3);
    const [ctaUrl, setCtaUrl] = useState("");
    const [ctaLabel, setCtaLabel] = useState("");
    const [loading, setLoading] = useState(false);

    if (posts.length === 0) {
        return (
            <div className="px-4 py-10 text-sm text-muted-foreground">
                {t("noPosts")}{" "}
                <Link href="/gekaixing" className="text-primary hover:underline">
                    {t("createNew")}
                </Link>
            </div>
        );
    }

    async function handleSubmit() {
        if (!selectedPostId) {
            toast.error(t("selectPost"));
            return;
        }
        setLoading(true);
        try {
            const createRes = await fetch("/api/ads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    postId: selectedPostId,
                    durationDays,
                    ctaUrl: ctaUrl.trim() || null,
                    ctaLabel: ctaLabel.trim() || null,
                }),
            });
            const createData = await createRes.json();
            if (!createRes.ok) {
                throw new Error(createData?.error ?? "Failed");
            }

            const checkoutRes = await fetch("/api/stripe/checkout-ad", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ adId: createData.data.adId }),
            });
            const checkoutData = await checkoutRes.json();
            if (!checkoutRes.ok || !checkoutData.url) {
                throw new Error(checkoutData?.error ?? "Failed");
            }

            window.location.href = checkoutData.url;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed");
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col gap-5 px-4">
            {/* 选择要推广的帖子 */}
            <div>
                <Label className="mb-2 block">{t("selectPost")}</Label>
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                    {posts.map((post) => {
                        const active = post.id === selectedPostId;
                        return (
                            <button
                                key={post.id}
                                type="button"
                                onClick={() => setSelectedPostId(post.id)}
                                className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-colors ${active
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:bg-muted/60"
                                    }`}
                            >
                                <span className={`mt-0.5 ${active ? "text-primary" : "text-muted-foreground/40"}`}>
                                    <Check className="h-4 w-4" />
                                </span>
                                <span
                                    className="line-clamp-3 flex-1 text-sm text-foreground/90"
                                    dangerouslySetInnerHTML={{ __html: post.content }}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 投放时长 */}
            <div className="grid gap-2">
                <Label>{t("duration")}</Label>
                <Select value={String(durationDays)} onValueChange={(value) => setDurationDays(Number(value))}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {AD_DURATION_DAYS.map((days) => (
                            <SelectItem key={days} value={String(days)}>
                                {t("durationDays", { days })}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* 价格 */}
            <div className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("price")}</span>
                    <span className="font-semibold">
                        {formatCents(adPriceCents(durationDays), AD_CURRENCY)}
                    </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                    {t("pricePerDay", { price: formatCents(AD_DAILY_PRICE_CENTS, AD_CURRENCY) })}
                </div>
            </div>

            {/* 落地页 CTA */}
            <div className="grid gap-4">
                <div className="grid gap-2">
                    <Label htmlFor="ctaUrl">{t("ctaUrl")}</Label>
                    <Input
                        id="ctaUrl"
                        type="url"
                        value={ctaUrl}
                        onChange={(event) => setCtaUrl(event.target.value)}
                        placeholder={t("ctaUrlPlaceholder")}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="ctaLabel">{t("ctaLabel")}</Label>
                    <Input
                        id="ctaLabel"
                        value={ctaLabel}
                        onChange={(event) => setCtaLabel(event.target.value)}
                        placeholder={t("ctaLabel")}
                    />
                </div>
            </div>

            <Button onClick={handleSubmit} disabled={loading || !selectedPostId}>
                {loading ? t("submitting") : t("submitPay")}
            </Button>
        </div>
    );
}
