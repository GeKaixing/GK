import { createClient } from "@/utils/supabase/server";
import { prisma } from "@/lib/prisma";
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

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/confirm`,
      },
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "Signup failed" },
        { status: 401 }
      );
    }

    // ✅ 邮箱有唯一约束，按 email 关联档案：
    // - 已存在（旧 auth id 残留）→ 把 id 同步为当前 auth id，避免"同一邮箱两账号"撞唯一约束
    // - 不存在 → 创建新档案
    await prisma.user.upsert({
      where: { email },
      update: {
        id: data.user.id,
      },
      create: {
        id: data.user.id,
        userid: `user_${data.user.id.slice(0, 8)}`,
        email,
        name: name ?? "anonymity",
        avatar: avatar ?? null,
      },
    });

    return NextResponse.json({ success: true });

  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}