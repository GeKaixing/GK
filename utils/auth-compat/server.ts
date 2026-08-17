import { hash } from "bcryptjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type CompatUserMetadata = {
  name?: string;
  avatar_url?: string;
  user_avatar?: string;
  has_gemini_key?: boolean;
  gemini_model?: string;
  gemini_updated_at?: string;
};

type CompatUser = {
  id: string;
  email: string;
  user_metadata: CompatUserMetadata;
};

type AuthResult = {
  data: { user: CompatUser | null };
  error: Error | null;
};

type UpdateUserPayload = {
  email?: string;
  password?: string;
  data?: Record<string, unknown>;
};

function buildUserMetadata(avatar: string | null, name: string | null): CompatUserMetadata {
  const metadata: CompatUserMetadata = {};

  if (typeof avatar === "string" && avatar.length > 0) {
    metadata.avatar_url = avatar;
    metadata.user_avatar = avatar;
  }
  if (typeof name === "string" && name.length > 0) {
    metadata.name = name;
  }

  return metadata;
}

type GeminiSettingsRow = {
  geminiApiKey: string | null;
  geminiModel: string | null;
  updatedAt: Date | null;
};

/**
 * Encryption helpers (AES-256-GCM) — lazy key read so imports don't throw at build time.
 * Format: "enc:" + base64(iv || authTag || ciphertext)
 */
function getEncKeyOrNull(): Buffer | null {
  const raw = process.env.GEMINI_KEY_ENC_SECRET ?? process.env.GEMINI_KEY_ENC_KEY ?? "";
  if (!raw) return null;
  try {
    // allow raw base64 or raw text; prefer base64 decode if length matches 44 (32 bytes base64)
    if (/^[A-Za-z0-9+/=]+$/.test(raw) && Buffer.from(raw, "base64").length === 32) {
      return Buffer.from(raw, "base64");
    }
    // otherwise derive a 32-byte key from string using SHA-256
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(String(raw)).digest();
  } catch {
    return null;
  }
}

function encryptForStorage(plaintext: string): string {
  const key = getEncKeyOrNull();
  if (!key) return plaintext; // no key configured — preserve plaintext for backwards compat

  const crypto = require("node:crypto");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, tag, ciphertext]);
  return `enc:${combined.toString("base64")}`;
}

function decryptFromStorage(stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith("enc:")) return stored; // plaintext or older value

  const key = getEncKeyOrNull();
  if (!key) return null; // cannot decrypt without key

  try {
    const crypto = require("node:crypto");
    const payload = Buffer.from(stored.slice(4), "base64");
    const iv = payload.slice(0, 12);
    const tag = payload.slice(12, 28);
    const ciphertext = payload.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    // decryption failed — return null to avoid exposing corrupted data
    return null;
  }
}

export async function getGeminiSettings(userId: string): Promise<GeminiSettingsRow | null> {
  const rows = await prisma.$queryRaw<GeminiSettingsRow[]>`
    SELECT "geminiApiKey", "geminiModel", "updatedAt"
    FROM "UserSettings"
    WHERE "userId" = ${userId}
    LIMIT 1
  `;

  const row = rows[0] ?? null;
  if (!row) return null;

  const decrypted = decryptFromStorage(row.geminiApiKey);
  return {
    geminiApiKey: decrypted,
    geminiModel: row.geminiModel,
    updatedAt: row.updatedAt,
  };
}

export async function getCurrentUserGeminiSettings(userId: string): Promise<{
  apiKey: string;
  model: string | null;
  updatedAt: Date | null;
}> {
  const settings = await getGeminiSettings(userId);
  return {
    apiKey: settings?.geminiApiKey?.trim() ?? "",
    model: settings?.geminiModel ?? null,
    updatedAt: settings?.updatedAt ?? null,
  };
}

async function upsertGeminiSettings(
  userId: string,
  settings: { geminiApiKey?: string | null; geminiModel?: string | null },
): Promise<void> {
  if (Object.keys(settings).length === 0) {
    return;
  }

  const existing = await getGeminiSettings(userId);
  const nextKeyPlain = settings.geminiApiKey ?? existing?.geminiApiKey ?? null;
  const nextKey = nextKeyPlain ? encryptForStorage(nextKeyPlain) : null;
  const nextModel = settings.geminiModel ?? existing?.geminiModel ?? null;

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

async function resolveCurrentUser(): Promise<CompatUser | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
    },
  });

  if (!dbUser) {
    return null;
  }

  const settings = await getGeminiSettings(userId);
  const hasGeminiKey = typeof settings?.geminiApiKey === "string" && settings.geminiApiKey.trim().length > 0;

  return {
    id: dbUser.id,
    email: dbUser.email,
    user_metadata: {
      ...buildUserMetadata(dbUser.avatar, dbUser.name),
      ...(hasGeminiKey ? { has_gemini_key: true } : {}),
      ...(settings?.geminiModel ? { gemini_model: settings.geminiModel } : {}),
      ...(settings?.updatedAt ? { gemini_updated_at: settings.updatedAt.toISOString() } : {}),
    },
  };
}

async function updateCurrentUser(payload: UpdateUserPayload): Promise<AuthResult> {
  try {
    const currentUser = await resolveCurrentUser();
    if (!currentUser) {
      return {
        data: { user: null },
        error: new Error("Unauthorized"),
      };
    }

    const updateData: {
      email?: string;
      passwordHash?: string;
    } = {};
    const settingsUpdate: {
      geminiApiKey?: string | null;
      geminiModel?: string | null;
    } = {};

    if (typeof payload.email === "string" && payload.email.length > 0) {
      updateData.email = payload.email;
    }

    if (typeof payload.password === "string" && payload.password.length >= 6) {
      updateData.passwordHash = await hash(payload.password, 12);
    }

    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
      if ("gemini_api_key" in payload.data) {
        const key = payload.data.gemini_api_key;
        settingsUpdate.geminiApiKey = typeof key === "string" && key.length > 0 ? key : null;
      }
      if ("gemini_model" in payload.data) {
        const model = payload.data.gemini_model;
        settingsUpdate.geminiModel = typeof model === "string" && model.length > 0 ? model : null;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
      },
    });

    await upsertGeminiSettings(currentUser.id, settingsUpdate);
    const refreshedSettings = await getGeminiSettings(currentUser.id);
    const hasGeminiKey =
      typeof refreshedSettings?.geminiApiKey === "string" && refreshedSettings.geminiApiKey.trim().length > 0;

    return {
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          user_metadata: {
            ...buildUserMetadata(updatedUser.avatar, updatedUser.name),
            ...(hasGeminiKey ? { has_gemini_key: true } : {}),
            ...(refreshedSettings?.geminiModel ? { gemini_model: refreshedSettings.geminiModel } : {}),
            ...(refreshedSettings?.updatedAt ? { gemini_updated_at: refreshedSettings.updatedAt.toISOString() } : {}),
          },
        },
      },
      error: null,
    };
  } catch (error) {
    return {
      data: { user: null },
      error: error instanceof Error ? error : new Error("Failed to update user"),
    };
  }
}

function createUnsupportedQueryBuilder() {
  const result = { data: [] as unknown[], error: null as Error | null };

  const builder: {
    select: (...args: unknown[]) => typeof builder;
    insert: (...args: unknown[]) => typeof builder;
    update: (...args: unknown[]) => typeof builder;
    delete: (...args: unknown[]) => typeof builder;
    eq: (...args: unknown[]) => typeof builder;
    neq: (...args: unknown[]) => typeof builder;
    ilike: (...args: unknown[]) => typeof builder;
    order: (...args: unknown[]) => typeof builder;
    limit: (...args: unknown[]) => typeof builder;
    range: (...args: unknown[]) => typeof builder;
    single: () => Promise<{ data: null; error: Error }>;
    then: (resolve: (value: { data: unknown[]; error: Error | null }) => unknown) => Promise<unknown>;
  } = {
    select: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    eq: () => builder,
    neq: () => builder,
    ilike: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    single: async () => ({
      data: null,
      error: new Error("Supabase query API is disabled in local Auth.js mode"),
    }),
    then: async (resolve) => resolve(result),
  };

  return builder;
}

export async function createClient() {
  return {
    auth: {
      getUser: async (): Promise<AuthResult> => {
        try {
          const user = await resolveCurrentUser();
          return {
            data: { user },
            error: null,
          };
        } catch (error) {
          return {
            data: { user: null },
            error: error instanceof Error ? error : new Error("Failed to get user"),
          };
        }
      },
      updateUser: async (payload: UpdateUserPayload, _options?: unknown): Promise<AuthResult> => {
        return await updateCurrentUser(payload);
      },
      resetPasswordForEmail: async (): Promise<{ data: null; error: Error }> => {
        return {
          data: null,
          error: new Error("Password reset email flow is not enabled in local Auth.js mode"),
        };
      },
      exchangeCodeForSession: async (): Promise<{ data: { user: null }; error: Error }> => {
        return {
          data: { user: null },
          error: new Error("OAuth code exchange is not available in this local auth mode"),
        };
      },
      signInWithPassword: async (): Promise<{ data: null; error: Error }> => {
        return {
          data: null,
          error: new Error("Use Auth.js credentials signIn on client"),
        };
      },
      signUp: async (): Promise<{ data: { user: null }; error: Error }> => {
        return {
          data: { user: null },
          error: new Error("Use /api/signup for user registration"),
        };
      },
      signOut: async (): Promise<{ error: null }> => {
        return { error: null };
      },
      getClaims: async (): Promise<{ data: { claims: Record<string, unknown> | null }; error: null }> => {
        const user = await resolveCurrentUser();
        return {
          data: {
            claims: user ? { sub: user.id, email: user.email } : null,
          },
          error: null,
        };
      },
    },
    from: (_table: string) => createUnsupportedQueryBuilder(),
  };
}
