import NextAuth from "next-auth";
import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { decodeAuthToken, encodeAuthToken, getAuthSecret } from "@/lib/auth/jwt";

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

function getGoogleOAuthTimeoutMs(): number {
  const parsed = Number(process.env.GOOGLE_OAUTH_TIMEOUT_MS ?? "15000");
  if (!Number.isFinite(parsed) || parsed < 1000) {
    return 15000;
  }
  return Math.floor(parsed);
}

function applyClashProxyEnv(): void {
  const clash = process.env.CLASH_PROXY_URL?.trim();
  if (!clash) {
    return;
  }

  if (!process.env.HTTPS_PROXY) {
    process.env.HTTPS_PROXY = clash;
  }
  if (!process.env.HTTP_PROXY) {
    process.env.HTTP_PROXY = clash;
  }
}

applyClashProxyEnv();

function applyOpenIdProxyDefaults(): void {
  const proxyUrl = process.env.CLASH_PROXY_URL?.trim() || process.env.HTTPS_PROXY?.trim();
  if (!proxyUrl) {
    return;
  }

  try {
    // next-auth uses openid-client internally for Google discovery/token exchange.
    // Force proxy + timeout defaults so OAuth requests go through Clash.
    const openid = require("openid-client") as {
      custom?: { setHttpOptionsDefaults: (options: Record<string, unknown>) => void };
    };
    const proxyModule = require("https-proxy-agent") as {
      HttpsProxyAgent?: new (proxy: string) => unknown;
      default?: new (proxy: string) => unknown;
    };
    const ProxyAgentCtor = proxyModule.HttpsProxyAgent ?? proxyModule.default;
    if (!ProxyAgentCtor || !openid.custom?.setHttpOptionsDefaults) {
      return;
    }

    openid.custom.setHttpOptionsDefaults({
      timeout: getGoogleOAuthTimeoutMs(),
      agent: new ProxyAgentCtor(proxyUrl),
    });
  } catch (error) {
    console.warn("Failed to apply openid proxy defaults:", error);
  }
}

applyOpenIdProxyDefaults();

async function upsertOAuthUser(params: {
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<string | null> {
  const email = params.email?.trim().toLowerCase() ?? "";
  if (!email) {
    return null;
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      avatar: true,
      emailVerifiedAt: true,
    },
  });

  if (existing) {
    const nextName = params.name?.trim() || existing.name;
    const nextAvatar = params.image?.trim() || existing.avatar;

    if (
      nextName !== existing.name ||
      nextAvatar !== existing.avatar ||
      !existing.emailVerifiedAt
    ) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          avatar: nextAvatar,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      });
    }

    return existing.id;
  }

  const created = await prisma.user.create({
    data: {
      email,
      name: params.name?.trim() || null,
      avatar: params.image?.trim() || null,
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });

  return created.id;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  jwt: {
    async encode(params) {
      return await encodeAuthToken(params);
    },
    async decode(params) {
      return await decodeAuthToken(params);
    },
  },
  // Resolve lazily (non-throwing) so importing @/auth never fails at build time
  // when the env var is missing; Auth.js also reads AUTH_SECRET/NEXTAUTH_SECRET
  // itself. Runtime fails only if the deployment truly lacks the secret.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            httpOptions: {
              timeout: getGoogleOAuthTimeoutMs(),
            },
          }),
        ]
      : []),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
          select: {
            id: true,
            email: true,
            name: true,
            emailVerifiedAt: true,
            passwordHash: true,
          },
        });

        if (!user?.passwordHash || !user.emailVerifiedAt) {
          return null;
        }

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        const userId = await upsertOAuthUser({
          email: user?.email ?? token.email,
          name: user?.name ?? null,
          image: (user as { image?: string | null } | undefined)?.image ?? null,
        });

        if (userId) {
          token.sub = userId;
          if (user?.email) {
            token.email = user.email;
          }
          if (user?.name) {
            token.name = user.name;
          }
          return token;
        }
      }

      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};

const routeHandler = NextAuth(authOptions);

export const handlers = {
  GET: routeHandler,
  POST: routeHandler,
};

export async function auth() {
  const serverSession = await getServerSession(authOptions);
  if (serverSession?.user?.id) {
    return serverSession;
  }

  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get("__Secure-next-auth.session-token")?.value ??
    cookieStore.get("next-auth.session-token")?.value ??
    null;

  if (!rawToken) {
    return null;
  }

  const decoded = await decodeAuthToken({
    token: rawToken,
    secret: getAuthSecret(),
  });

  if (!decoded?.sub) {
    return null;
  }

  return {
    user: {
      id: String(decoded.sub),
      email: typeof decoded.email === "string" ? decoded.email : null,
      name: typeof decoded.name === "string" ? decoded.name : null,
    },
    expires: new Date(((decoded.exp ?? 0) as number) * 1000).toISOString(),
  };
}
