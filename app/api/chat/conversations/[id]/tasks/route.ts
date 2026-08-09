import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/utils/supabase/server";

const VALID_STATUS = ["planned", "in_progress", "done"];

const ASSIGNEE_SELECT = {
  select: { id: true, name: true, avatar: true, userid: true },
} as const;

function serializeTask(task: {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  status: string;
  startDate: Date;
  endDate: Date;
  assignee: { id: string; name: string | null; avatar: string | null; userid: string } | null;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    assigneeId: task.assigneeId,
    status: task.status,
    startDate: task.startDate.toISOString(),
    endDate: task.endDate.toISOString(),
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name || task.assignee.userid,
          avatar: task.assignee.avatar,
        }
      : null,
  };
}

// 任务列表（群成员可见）
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

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

    const tasks = await prisma.workTask.findMany({
      where: { conversationId: id },
      include: { assignee: ASSIGNEE_SELECT },
      orderBy: [{ startDate: "asc" }],
    });

    return NextResponse.json({
      data: { callerRole: caller.role, tasks: tasks.map(serializeTask) },
      success: true,
    });
  } catch (error) {
    console.error("Failed to fetch tasks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 创建任务（仅管理员）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { title, description, assigneeId, status, startDate, endDate } =
      await request.json();

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
        { error: "Only admins can create tasks" },
        { status: 403 }
      );
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Task title is required" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid dates" },
        { status: 400 }
      );
    }
    if (end < start) {
      return NextResponse.json(
        { error: "End date cannot be before start date" },
        { status: 400 }
      );
    }

    const finalStatus =
      typeof status === "string" && VALID_STATUS.includes(status)
        ? status
        : "planned";

    const task = await prisma.workTask.create({
      data: {
        conversationId: id,
        title: title.trim(),
        description: typeof description === "string" ? description : null,
        assigneeId:
          typeof assigneeId === "string" && assigneeId ? assigneeId : null,
        status: finalStatus,
        startDate: start,
        endDate: end,
        createdById: user.id,
      },
      include: { assignee: ASSIGNEE_SELECT },
    });

    return NextResponse.json({
      data: serializeTask(task),
      success: true,
    });
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
