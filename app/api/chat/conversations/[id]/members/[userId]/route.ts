import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

// 禁言 / 取消禁言某个群成员
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, userId } = await params;
    const { muted } = await request.json();

    if (userId === user.id) {
      return NextResponse.json(
        { error: "You cannot mute yourself" },
        { status: 400 }
      );
    }

    const caller = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    if (caller?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can mute members" },
        { status: 403 }
      );
    }

    const target = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId,
        },
      },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    await prisma.conversationParticipant.update({
      where: { id: target.id },
      data: { mutedAt: muted ? new Date() : null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update mute:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 把某个群成员踢出群
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, userId } = await params;

    if (userId === user.id) {
      return NextResponse.json(
        { error: "You cannot kick yourself" },
        { status: 400 }
      );
    }

    const caller = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    if (caller?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can kick members" },
        { status: 403 }
      );
    }

    const target = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId,
        },
      },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    await prisma.$transaction([
      prisma.conversationParticipant.delete({
        where: { id: target.id },
      }),
      prisma.conversationRead.deleteMany({
        where: { conversationId: id, userId },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to kick member:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
