import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/security/rate-limit";

interface LoginBody {
  email: string;
  password: string;
}

const LOGIN_RATE_LIMIT = {
  limit: 10,
  windowMs: 15 * 60 * 1000,
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const email = body.email?.trim().toLowerCase();
    const { password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 },
      );
    }

    const rateLimit = await enforceRateLimit(request, "login", email, LOGIN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerifiedAt: true,
        passwordHash: true,
      },
    });

    if (!user?.passwordHash) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 },
      );
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json(
        { success: false, error: "Email is not verified" },
        { status: 403 },
      );
    }

    const valid = await compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid credentials" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Login verification failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
