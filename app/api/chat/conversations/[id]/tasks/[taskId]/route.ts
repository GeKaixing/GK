import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const VALID_STATUS = ["planned", "in_progress", "done"];

// 编辑任务（管理员可改全部；负责人可改自己任务的 status / description）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, taskId } = await params;

    const caller = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: id,
          userId: user.id,
        },
      },
      select: { role: true },
    });
    if (!caller) {
      return NextResponse.json(
        { error: "Not a participant" },
        { status: 403 }
      );
    }
    const isAdmin = caller.role === "admin";

    const task = await prisma.workTask.findFirst({
      where: { id: taskId, conversationId: id },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (!isAdmin) {
      // 非管理员仅允许负责人更新自己任务的 status / description
      if (task.assigneeId !== user.id) {
        return NextResponse.json(
          { error: "Only admins or the assigned member can edit this task" },
          { status: 403 }
        );
      }
      const editableKeys = new Set(["status", "description"]);
      if (!Object.keys(body).every((k) => editableKeys.has(k))) {
        return NextResponse.json(
          { error: "You can only update the status or description" },
          { status: 403 }
        );
      }
      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !VALID_STATUS.includes(body.status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        data.status = body.status;
      }
      if (body.description !== undefined) {
        data.description =
          typeof body.description === "string" ? body.description : null;
      }
      if (Object.keys(data).length === 0) {
        return NextResponse.json(
          { error: "No editable fields" },
          { status: 400 }
        );
      }
    } else {
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || !body.title.trim()) {
          return NextResponse.json(
            { error: "Task title is required" },
            { status: 400 }
          );
        }
        data.title = body.title.trim();
      }

      if (body.description !== undefined) {
        data.description =
          typeof body.description === "string" ? body.description : null;
      }

      if (body.assigneeId !== undefined) {
        data.assigneeId =
          typeof body.assigneeId === "string" && body.assigneeId
            ? body.assigneeId
            : null;
      }

      if (body.status !== undefined) {
        if (typeof body.status !== "string" || !VALID_STATUS.includes(body.status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        data.status = body.status;
      }

      if (body.startDate !== undefined || body.endDate !== undefined) {
        const start = body.startDate !== undefined ? new Date(body.startDate) : task.startDate;
        const end = body.endDate !== undefined ? new Date(body.endDate) : task.endDate;
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
        }
        if (end < start) {
          return NextResponse.json(
            { error: "End date cannot be before start date" },
            { status: 400 }
          );
        }
        if (body.startDate !== undefined) data.startDate = start;
        if (body.endDate !== undefined) data.endDate = end;
      }
    }

    await prisma.workTask.update({
      where: { id: taskId },
      data,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 删除任务（仅管理员）
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, taskId } = await params;

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
        { error: "Only admins can delete tasks" },
        { status: 403 }
      );
    }

    const task = await prisma.workTask.findFirst({
      where: { id: taskId, conversationId: id },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.workTask.delete({ where: { id: taskId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
