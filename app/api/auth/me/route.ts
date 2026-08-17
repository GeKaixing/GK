import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function buildMetadata(avatar: string | null, name: string | null): Record<string, string | boolean> {
  const base: Record<string, string | boolean> = {};
  if (avatar) {
    base.avatar_url = avatar;
    base.user_avatar = avatar;
  }
  if (name) {
    base.name = name;
  }
  return base;
}

type GeminiSettingsRow = {
  geminiApiKey: string | null;
  geminiModel: string | null;
  updatedAt: Date | null;
};

async function getGeminiSettings(userId: string): Promise<GeminiSettingsRow | null> {
  const rows = await prisma.$queryRaw<GeminiSettingsRow[]>`
    SELECT "geminiApiKey", "geminiModel", "updatedAt"
    FROM "UserSettings"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getGeminiSettings(userId);
  const hasGeminiKey = typeof settings?.geminiApiKey === "string" && settings.geminiApiKey.trim().length > 0;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      user_metadata: {
        ...buildMetadata(user.avatar, user.name),
        ...(hasGeminiKey ? { has_gemini_key: true } : {}),
        ...(settings?.geminiModel ? { gemini_model: settings.geminiModel } : {}),
        ...(settings?.updatedAt ? { gemini_updated_at: settings.updatedAt.toISOString() } : {}),
      },
    },
  });
}
