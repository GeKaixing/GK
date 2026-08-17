import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { createVerificationToken, hashVerificationToken } from "@/lib/auth/email-verification";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { sendVerificationEmail } from "@/lib/auth/mailer";

interface SignupBody {
  email: string;
  password: string;
  name?: string | null;
  avatar?: string | null;
}

const SIGNUP_RATE_LIMIT = {
  limit: 5,
  windowMs: 60 * 60 * 1000,
};

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_URL ??
    "http://localhost:3000"
  );
}

function buildVerifyLink(baseUrl: string, token: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${normalized}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SignupBody;
    const email = body.email?.trim().toLowerCase();
    const { password, name, avatar } = body;

    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 400 },
      );
    }

    const rateLimit = await enforceRateLimit(request, "signup", email, SIGNUP_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many signup attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerifiedAt: true },
    });

    const passwordHash = await hash(password, 12);

    if (existingUser?.emailVerifiedAt) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 },
      );
    }

    if (existingUser && !existingUser.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          name: name ?? "anonymity",
          avatar: avatar ?? null,
        },
      });
    } else {
      await prisma.user.create({
        data: {
          email,
          passwordHash,
          userid: `user_${crypto.randomUUID().slice(0, 8)}`,
          name: name ?? "anonymity",
          avatar: avatar ?? null,
          emailVerifiedAt: null,
        },
      });
    }

    await prisma.emailVerificationToken.deleteMany({
      where: {
        email,
        usedAt: null,
      },
    });

    const { token, expiresAt } = await createVerificationToken(email);
    const tokenHash = hashVerificationToken(token);
    await prisma.emailVerificationToken.create({
      data: {
        email,
        tokenHash,
        expiresAt,
      },
    });

    const verifyLink = buildVerifyLink(getBaseUrl(), token);
    await sendVerificationEmail({ to: email, verifyLink });

    return NextResponse.json({ success: true, verificationSent: true });
  } catch (error) {
    console.error("Signup failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
