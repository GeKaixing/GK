import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function buildMetadata(avatar: string | null, name: string | null): Record<string, string> {
  const base: Record<string, string> = {};
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

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      user_metadata: {
        ...buildMetadata(user.avatar, user.name),
        ...(settings?.geminiApiKey ? { gemini_api_key: settings.geminiApiKey } : {}),
        ...(settings?.geminiModel ? { gemini_model: settings.geminiModel } : {}),
        ...(settings?.updatedAt ? { gemini_updated_at: settings.updatedAt.toISOString() } : {}),
      },
    },
  });
}
