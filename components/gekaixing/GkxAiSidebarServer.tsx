"use server"

import { createClient } from "@/utils/supabase/server";
import GkxAiSidebar from "./GkxAiSidebar";
import { prisma } from "@/lib/prisma";
import { getUserAiConfig } from "@/lib/ai/config";

export default async function GkxAiSidebarServer() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // 获取历史会话
    const sessions = await prisma.chatAISession.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
    });

    // 当前 AI 提供商 / 模型
    const config = getUserAiConfig(user);
    const providerLabel =
        config.provider === "google"
            ? "Gemini"
            : config.provider === "openai"
                ? "OpenAI"
                : "AI";
    const modelLabel = config.model
        ? `${providerLabel} · ${config.model}`
        : providerLabel;

    return (
        <GkxAiSidebar
            sessions={sessions}
            userId={user.id}
            modelLabel={modelLabel}
        />
    )
}
