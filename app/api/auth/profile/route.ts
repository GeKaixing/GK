import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface UpdateProfileBody {
  email?: string;
  password?: string;
  data?: Record<string, unknown>;
}

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

async function upsertGeminiSettings(
  userId: string,
  settingsUpdate: { geminiApiKey?: string | null; geminiModel?: string | null },
): Promise<void> {
  if (Object.keys(settingsUpdate).length === 0) {
    return;
  }

  const existing = await getGeminiSettings(userId);
  const nextKey = settingsUpdate.geminiApiKey ?? existing?.geminiApiKey ?? null;
  const nextModel = settingsUpdate.geminiModel ?? existing?.geminiModel ?? null;

  await prisma.$executeRaw`
    INSERT INTO "UserSettings" ("userId", "geminiApiKey", "geminiModel", "updatedAt")
    VALUES (${userId}, ${nextKey}, ${nextModel}, NOW())
    ON CONFLICT ("userId")
    DO UPDATE SET
      "geminiApiKey" = EXCLUDED."geminiApiKey",
      "geminiModel" = EXCLUDED."geminiModel",
      "updatedAt" = NOW()
  `;
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateProfileBody;
  const updateData: {
    email?: string;
    passwordHash?: string;
  } = {};
  const settingsUpdate: {
    geminiApiKey?: string | null;
    geminiModel?: string | null;
  } = {};

  if (typeof body.email === "string" && body.email.length > 0) {
    updateData.email = body.email;
  }

  if (typeof body.password === "string") {
    if (body.password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }
    updateData.passwordHash = await hash(body.password, 12);
  }

  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    if ("gemini_api_key" in body.data) {
      const key = body.data.gemini_api_key;
      settingsUpdate.geminiApiKey = typeof key === "string" && key.length > 0 ? key : null;
    }
    if ("gemini_model" in body.data) {
      const model = body.data.gemini_model;
      settingsUpdate.geminiModel = typeof model === "string" && model.length > 0 ? model : null;
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
    },
  });

  await upsertGeminiSettings(userId, settingsUpdate);
  const settings = await getGeminiSettings(userId);

  return NextResponse.json({
    user: {
      id: updated.id,
      email: updated.email,
      user_metadata: {
        ...buildMetadata(updated.avatar, updated.name),
        ...(settings?.geminiApiKey ? { gemini_api_key: settings.geminiApiKey } : {}),
        ...(settings?.geminiModel ? { gemini_model: settings.geminiModel } : {}),
        ...(settings?.updatedAt ? { gemini_updated_at: settings.updatedAt.toISOString() } : {}),
      },
    },
  });
}
