import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { createClient as createClientROLE } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prismaUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    return NextResponse.json({
      id: prismaUser?.id || null,
      userid: prismaUser?.userid || null,
      success: true,
    });
  } catch (error) {
    console.error("Failed to fetch userid:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const body = await request.json();

  const { name, backgroundImage, avatar, briefIntroduction, userid } = body;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updateData: Record<string, string | null> = {};
  if (name !== undefined) updateData.name = name;
  if (backgroundImage !== undefined)
    updateData.backgroundImage = backgroundImage;
  if (avatar !== undefined) updateData.avatar = avatar;
  if (briefIntroduction !== undefined)
    updateData.briefIntroduction = briefIntroduction;

  const hasFieldsToUpdate = Object.keys(updateData).length > 0;

  if (userid !== undefined && userid !== "") {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { userid },
      });

      if (existingUser && existingUser.id !== user.id) {
        return NextResponse.json(
          { error: "该用户ID已被使用" },
          { status: 400 },
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { userid },
      });
    } catch (error) {
      console.error("Failed to update userid:", error);
      return NextResponse.json({ error: "更新用户ID失败" }, { status: 500 });
    }
  }

  if (!hasFieldsToUpdate && userid === undefined) {
    return NextResponse.json(
      { error: "No valid fields provided" },
      { status: 400 },
    );
  }

  if (hasFieldsToUpdate) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    } catch (error) {
      console.error("Failed to update user in Prisma:", error);
      return NextResponse.json({ error: "更新用户信息失败" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const supabaseAdmin = createClientROLE(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const body = await req.json();
  const { userId } = body;

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
