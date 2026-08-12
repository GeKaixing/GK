import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
import { ensureCitizen } from "@/lib/osp";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { email, password, name, avatar } = await request.json();

    // Use the app's own origin so the confirmation link points here in dev and
    // prod (must be allowlisted in Supabase -> Authentication -> URL Configuration).
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_URL ||
      "http://localhost:3000";
    const redirectTo = `${origin}/auth/confirm`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error || !data.user) {
      // 已注册且已确认的邮箱，signUp() 会返回 "User already registered"
      if (error?.message?.toLowerCase().includes("already registered")) {
        return NextResponse.json(
          { error: error.message, code: "ALREADY_REGISTERED" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: error?.message ?? "Signup failed" },
        { status: 401 }
      );
    }

    // 已确认的老账户（无 session + email_confirmed_at 有值）→ 让用户去登录
    if (!data.session && data.user.email_confirmed_at) {
      return NextResponse.json(
        { error: "Email already registered", code: "ALREADY_REGISTERED" },
        { status: 409 }
      );
    }

    // 对"已注册但未确认"的邮箱，signUp() 不会再发确认邮件——这正是"点了链接
    // 出错后再次提交就没有邮件"的原因。无 session 说明该邮箱已注册过；但首次
    // 注册的账户是刚由这次请求创建的（created_at≈现在，邮件已发出），无需补发，
    // 只有创建超过 60 秒的老账户才 resend() 重新发送确认邮件。
    const isExistingUnconfirmed =
      !data.session &&
      Date.now() - new Date(data.user.created_at).getTime() > 60_000;

    if (isExistingUnconfirmed) {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (resendError) {
        return NextResponse.json(
          { error: resendError.message },
          { status: 429 }
        );
      }
    }

    const authUserId = data.user.id;

    // ✅ 邮箱有唯一约束，按 email 关联档案：
    // - 已存在（旧 auth id 残留）→ 把 id 同步为当前 auth id，避免"同一邮箱两账号"撞唯一约束
    // - 不存在 → 创建新档案
    await prisma.user.upsert({
      where: { email },
      update: {
        id: authUserId,
      },
      create: {
        id: authUserId,
        userid: `user_${authUserId.slice(0, 8)}`,
        email,
        name: name ?? "anonymity",
        avatar: avatar ?? null,
      },
    });

    // OSP identity bootstrap: Actor + Passport + capability seeds + lifecycle
    // events. A failure here fails the signup — identity is part of account creation.
    await ensureCitizen(authUserId);

    return NextResponse.json({ success: true });

  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
