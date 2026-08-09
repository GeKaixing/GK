import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                email: true,
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
          },
        },
        readStates: {
          where: {
            userId: user.id,
          },
          select: {
            lastReadMessageCount: true,
          },
        },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    const formattedConversations = conversations.map((conv) => {
      const otherParticipant = conv.participants.find(
        (p) => p.userId !== user.id
      )?.user;

      const readState = conv.readStates[0];
      const unreadCount = conv.messageCount - (readState?.lastReadMessageCount || 0);

      return {
        id: conv.id,
        name: conv.isGroup ? conv.name : otherParticipant?.name || "未知用户",
        avatar: conv.isGroup ? conv.avatar : otherParticipant?.avatar,
        isGroup: conv.isGroup,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        unreadCount: Math.max(0, unreadCount),
        participantId: otherParticipant?.id,
        participantEmail: otherParticipant?.email,
      };
    });

    return NextResponse.json({
      data: formattedConversations,
      success: true,
    });
  } catch (error) {
    console.error("Failed to fetch conversations:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { targetUserId, memberIds, isGroup, name } = await request.json();

    // 群聊：多选成员创建真正的群会话
    if (isGroup) {
      const members = Array.isArray(memberIds)
        ? [
            ...new Set(
              memberIds.filter(
                (id): id is string => typeof id === "string" && id !== user.id
              )
            ),
          ]
        : [];

      if (members.length === 0) {
        return NextResponse.json(
          { error: "At least one member is required" },
          { status: 400 }
        );
      }

      const participantUserIds = [user.id, ...members];

      const groupConversation = await prisma.conversation.create({
        data: {
          isGroup: true,
          name:
            typeof name === "string" && name.trim() ? name.trim() : "Group",
          participants: {
            create: participantUserIds.map((userId) => ({ userId })),
          },
          readStates: {
            create: participantUserIds.map((userId) => ({
              userId,
              lastReadMessageCount: 0,
            })),
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: { id: true, name: true, avatar: true, email: true },
              },
            },
          },
        },
      });

      return NextResponse.json({
        data: {
          id: groupConversation.id,
          name: groupConversation.name || "Group",
          avatar: groupConversation.avatar,
          isGroup: true,
          participantId: null,
          isNew: true,
        },
        success: true,
      });
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: "Target user ID is required" },
        { status: 400 }
      );
    }

    const existingConversation = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          {
            participants: {
              some: {
                userId: user.id,
              },
            },
          },
          {
            participants: {
              some: {
                userId: targetUserId,
              },
            },
          },
        ],
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (existingConversation) {
      const otherParticipant = existingConversation.participants.find(
        (p) => p.userId !== user.id
      )?.user;

      return NextResponse.json({
        data: {
          id: existingConversation.id,
          name: otherParticipant?.name || "未知用户",
          avatar: otherParticipant?.avatar,
          participantId: otherParticipant?.id,
          isNew: false,
        },
        success: true,
      });
    }

    const newConversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        participants: {
          create: [
            { userId: user.id },
            { userId: targetUserId },
          ],
        },
        readStates: {
          create: [
            { userId: user.id, lastReadMessageCount: 0 },
            { userId: targetUserId, lastReadMessageCount: 0 },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const otherParticipant = newConversation.participants.find(
      (p) => p.userId !== user.id
    )?.user;

    return NextResponse.json({
      data: {
        id: newConversation.id,
        name: otherParticipant?.name || "未知用户",
        avatar: otherParticipant?.avatar,
        participantId: otherParticipant?.id,
        isNew: true,
      },
      success: true,
    });
  } catch (error) {
    console.error("Failed to create conversation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
