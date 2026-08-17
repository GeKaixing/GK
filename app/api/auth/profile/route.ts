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

function buildMetadata(avatar: string | null, name: string | null) {
  return { ...(avatar ? { avatar_url: avatar, user_avatar: avatar } : {}), ...(name ? { name } : {}) };
}

type GeminiSettingsRow = { geminiApiKey: string | null; geminiModel: string | null; updatedAt: Date | null };

async function getGeminiSettings(userId: string): Promise<GeminiSettingsRow | null> {
  const rows = await prisma.$queryRaw<GeminiSettingsRow[]>`SELECT "geminiApiKey", "geminiModel", "updatedAt" FROM "UserSettings" WHERE "userId" = ${userId} LIMIT 1`;
  return rows[0] ?? null;
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const body = (await request.json()) as UpdateProfileBody;
  const updated = await prisma.user.update({ where: { id: userId }, data: { ...(body.email ? { email: body.email } : {}), ...(body.password ? { passwordHash: await hash(body.password, 12) } : {}) }, select: { id:true,email:true,name:true,avatar:true } });
  const settings = await getGeminiSettings(userId);
  return NextResponse.json({ user: { id: updated.id, email: updated.email, user_metadata: { ...buildMetadata(updated.avatar, updated.name), ...(settings?.geminiApiKey ? { has_gemini_key:true } : {}), ...(settings?.geminiModel ? { gemini_model: settings.geminiModel } : {}), ...(settings?.updatedAt ? { gemini_updated_at: settings.updatedAt.toISOString() } : {}) } } });
}
