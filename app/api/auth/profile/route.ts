import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface UpdateProfileBody { email?: string; password?: string; data?: Record<string, unknown>; }

type GeminiSettingsRow = { geminiApiKey: string | null; geminiModel: string | null; updatedAt: Date | null };

function buildMetadata(avatar: string | null, name: string | null) {
  return { ...(avatar ? { avatar_url: avatar, user_avatar: avatar } : {}), ...(name ? { name } : {}) };
}

async function getGeminiSettings(userId: string): Promise<GeminiSettingsRow | null> {
  const rows = await prisma.$queryRaw<GeminiSettingsRow[]>`SELECT "geminiApiKey", "geminiModel", "updatedAt" FROM "UserSettings" WHERE "userId" = ${userId} LIMIT 1`;
  return rows[0] ?? null;
}

async function upsertGeminiSettings(userId: string, update: { geminiApiKey?: string | null; geminiModel?: string | null }) {
  if (!Object.keys(update).length) return;
  const existing = await getGeminiSettings(userId);
  await prisma.$executeRaw`
    INSERT INTO "UserSettings" ("userId", "geminiApiKey", "geminiModel", "updatedAt")
    VALUES (${userId}, ${update.geminiApiKey ?? existing?.geminiApiKey ?? null}, ${update.geminiModel ?? existing?.geminiModel ?? null}, NOW())
    ON CONFLICT ("userId") DO UPDATE SET "geminiApiKey" = EXCLUDED."geminiApiKey", "geminiModel" = EXCLUDED."geminiModel", "updatedAt" = NOW()
  `;
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as UpdateProfileBody;
  const updateData: { email?: string; passwordHash?: string } = {};
  const settingsUpdate: { geminiApiKey?: string | null; geminiModel?: string | null } = {};

  if (body.email) updateData.email = body.email;
  if (body.password) updateData.passwordHash = await hash(body.password, 12);
  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    if (typeof body.data.gemini_api_key === "string") settingsUpdate.geminiApiKey = body.data.gemini_api_key;
    if (typeof body.data.gemini_model === "string") settingsUpdate.geminiModel = body.data.gemini_model;
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: updateData, select: { id: true, email: true, name: true, avatar: true } });
  await upsertGeminiSettings(userId, settingsUpdate);
  const settings = await getGeminiSettings(userId);

  return NextResponse.json({ user: { id: updated.id, email: updated.email, user_metadata: { ...buildMetadata(updated.avatar, updated.name), ...(settings?.geminiApiKey ? { has_gemini_key: true } : {}), ...(settings?.geminiModel ? { gemini_model: settings.geminiModel } : {}), ...(settings?.updatedAt ? { gemini_updated_at: settings.updatedAt.toISOString() } : {}) } } });
}
