"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Send,
  ChevronLeft,
  Loader2,
  MessageCircle,
  SquarePen,
  Users,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";

interface Contact {
  id: string;
  name: string;
  avatar?: string;
  unreadCount: number;
  participantId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

interface Message {
  id: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  conversationId: string;
  content: string;
  createdAt: string;
  isMe: boolean;
}

interface ConversationResponse {
  id: string;
  name: string;
  avatar?: string;
  unreadCount: number;
  participantId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
}

interface RealtimeMessage {
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 同一发送者、间隔 ≤5 分钟的消息归为一组气泡 */
const GROUP_GAP_MS = 5 * 60 * 1000;

type RenderItem =
  | { type: "divider"; dayKey: number }
  | { type: "group"; messages: Message[] };

/**
 * 把消息流拆成「日期分隔 + 连续消息组」的渲染列表：
 * - 跨天插入日期分隔条
 * - 同一发送者且时间相近的消息合并成一组气泡
 */
function buildRenderItems(messages: Message[]): RenderItem[] {
  const items: RenderItem[] = [];
  let currentGroup: Message[] | null = null;
  let currentDay = -1;
  let prev: Message | null = null;

  const flush = () => {
    if (currentGroup) {
      items.push({ type: "group", messages: currentGroup });
      currentGroup = null;
    }
  };

  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    if (day !== currentDay) {
      flush();
      items.push({ type: "divider", dayKey: day });
      currentDay = day;
    }

    const isNearby =
      prev !== null &&
      prev.senderId === msg.senderId &&
      d.getTime() - new Date(prev.createdAt).getTime() <= GROUP_GAP_MS;

    if (currentGroup && isNearby) {
      currentGroup.push(msg);
    } else {
      flush();
      currentGroup = [msg];
    }
    prev = msg;
  }
  flush();

  return items;
}

export default function ChatPage() {
  const t = useTranslations("ImitationX.ChatPage");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userIdFromQuery = searchParams.get("userId");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [supabase] = useState(() => createClient());
  const creatingConversationRef = useRef<Set<string>>(new Set());

  const selectedContact = contacts.find((c) => c.id === selectedContactId);

  const myAvatarUrl =
    currentUser?.user_metadata?.user_avatar ||
    currentUser?.user_metadata?.avatar_url ||
    "";

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);
    };

    void getUser();
  }, [supabase]);

  const createConversation = useCallback(async (targetUserId: string) => {
    if (creatingConversationRef.current.has(targetUserId)) {
      return;
    }
    creatingConversationRef.current.add(targetUserId);

    try {
      const response = await fetch("/api/chat/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      const result = await response.json();
      if (result.success && result.data) {
        const newContact: Contact = {
          id: result.data.id,
          name: result.data.name,
          avatar: result.data.avatar,
          unreadCount: 0,
          participantId: result.data.participantId,
        };

        setContacts((prev) => {
          const exists = prev.some((c) => c.id === newContact.id);
          if (exists) {
            return prev;
          }
          return [newContact, ...prev];
        });

        setSelectedContactId(result.data.id);
      }
    } catch (error) {
      console.error("Failed to create conversation:", error);
    } finally {
      creatingConversationRef.current.delete(targetUserId);
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/conversations");
      const result = await response.json();

      if (result.success && result.data) {
        const formattedContacts = (result.data as ConversationResponse[]).map((conv) => ({
          id: conv.id,
          name: conv.name,
          avatar: conv.avatar,
          unreadCount: conv.unreadCount,
          participantId: conv.participantId,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
        }));

        const uniqueContacts = formattedContacts.filter(
          (contact, index, self) => index === self.findIndex((c) => c.id === contact.id)
        );

        setContacts(uniqueContacts);

        if (userIdFromQuery) {
          const existingConv = formattedContacts.find((c) => c.participantId === userIdFromQuery);
          if (existingConv) {
            setSelectedContactId(existingConv.id);
          } else {
            await createConversation(userIdFromQuery);
          }
        } else if (formattedContacts.length > 0 && !selectedContactId) {
          setSelectedContactId(formattedContacts[0].id);
        }
      } else if (userIdFromQuery) {
        await createConversation(userIdFromQuery);
      }
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    }
  }, [createConversation, selectedContactId, userIdFromQuery]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const response = await fetch(`/api/chat/messages?conversationId=${conversationId}`);
      const result = await response.json();

      if (result.success && result.data) {
        setMessages(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  }, []);

  useEffect(() => {
    void fetchConversations().then(() => setIsLoading(false));
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedContactId) {
      return;
    }

    void fetchMessages(selectedContactId);
  }, [fetchMessages, selectedContactId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!currentUser?.id) {
      return;
    }

    const channel = supabase
      .channel(`chat-room-${selectedContactId || "global"}`)
      .on("broadcast", { event: "new-message" }, (payload) => {
        const newMessage = payload.payload as RealtimeMessage;

        if (newMessage.conversationId === selectedContactId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) {
              return prev;
            }

            const formattedMessage: Message = {
              id: newMessage.id,
              senderId: newMessage.senderId,
              conversationId: newMessage.conversationId,
              content: newMessage.content,
              createdAt: newMessage.createdAt,
              isMe: newMessage.senderId === currentUser.id,
            };

            return [...prev, formattedMessage];
          });
        } else {
          setContacts((prev) =>
            prev.map((c) =>
              c.id === newMessage.conversationId
                ? {
                    ...c,
                    unreadCount: c.unreadCount + 1,
                    lastMessage: newMessage.content,
                    lastMessageAt: newMessage.createdAt,
                  }
                : c
            )
          );
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Chat channel error occurred");
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentUser?.id, selectedContactId, supabase]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !selectedContactId) {
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      senderId: currentUser?.id || "",
      conversationId: selectedContactId,
      content: inputMessage.trim(),
      createdAt: new Date().toISOString(),
      isMe: true,
    };

    setMessages((prev) => [...prev, tempMessage]);
    setInputMessage("");

    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedContactId,
          content: tempMessage.content,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const savedMessage = result.data as Message;

        setMessages((prev) => prev.map((m) => (m.id === tempId ? savedMessage : m)));
        setContacts((prev) =>
          prev.map((c) =>
            c.id === selectedContactId
              ? { ...c, lastMessage: tempMessage.content, lastMessageAt: new Date().toISOString() }
              : c
          )
        );

        await supabase.channel(`chat-room-${selectedContactId}`).send({
          type: "broadcast",
          event: "new-message",
          payload: {
            id: savedMessage.id,
            senderId: savedMessage.senderId,
            conversationId: savedMessage.conversationId,
            content: savedMessage.content,
            createdAt: savedMessage.createdAt,
          },
        });
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDayLabel = (dayKey: number): string => {
    const date = new Date(dayKey);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((todayStart - dayKey) / DAY_MS);

    if (diffDays <= 0) {
      return t("dateToday");
    }
    if (diffDays === 1) {
      return t("dateYesterday");
    }
    return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : locale, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).format(date);
  };

  const formatListTime = (timestamp?: string): string => {
    if (!timestamp) {
      return "";
    }
    const date = new Date(timestamp);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((todayStart - startOfDayOf(date)) / DAY_MS);

    if (diffDays <= 0) {
      return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays === 1) {
      return t("dateYesterday");
    }
    if (diffDays < 7) {
      return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : locale, {
        weekday: "short",
      }).format(date);
    }
    return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : locale, {
      month: "numeric",
      day: "numeric",
    }).format(date);
  };

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId);
    // 清空旧会话消息，避免新会话加载期间闪现上一条会话的内容
    setMessages([]);
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, unreadCount: 0 } : c)));
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-3 bg-background sm:h-[100dvh]">
        <div className="flex size-11 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-border/50">
          <MessageCircle className="size-5 text-primary" />
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("loading")}
        </div>
      </div>
    );
  }

  const renderItems = buildRenderItems(messages);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] bg-background sm:h-[100dvh]">
      {/* 桌面端：会话列表 */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border/60 sm:flex lg:w-[300px]">
        <ListHeader
          title={t("title")}
          newLabel={t("newMessage")}
          onNewMessage={() => router.push("/gekaixing/connect_people")}
        />
        <nav className="min-h-0 flex-1 overflow-y-auto">
          {contacts.map((contact) => (
            <ConversationRow
              key={contact.id}
              contact={contact}
              active={contact.id === selectedContactId}
              timeLabel={formatListTime(contact.lastMessageAt)}
              onSelect={() => handleContactSelect(contact.id)}
            />
          ))}
        </nav>
      </aside>

      {/* 主区域 */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* 手机端：会话列表（选中会话后隐藏） */}
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col sm:hidden",
            selectedContactId && "hidden"
          )}
        >
          <ListHeader
            title={t("title")}
            newLabel={t("newMessage")}
            onNewMessage={() => router.push("/gekaixing/connect_people")}
          />
          <nav className="min-h-0 flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+5.5rem)]">
            {contacts.length === 0 ? (
              <div className="flex min-h-full items-center justify-center">
                <ChatEmptyState
                  hasContacts={false}
                  title={t("emptyTitle")}
                  sub={t("emptySub")}
                  buttonLabel={t("findChats")}
                  onFindChats={() => router.push("/gekaixing/connect_people")}
                />
              </div>
            ) : (
              contacts.map((contact) => (
                <ConversationRow
                  key={contact.id}
                  contact={contact}
                  active={contact.id === selectedContactId}
                  timeLabel={formatListTime(contact.lastMessageAt)}
                  onSelect={() => handleContactSelect(contact.id)}
                />
              ))
            )}
          </nav>
        </div>

        {/* 桌面端：未选会话时的空状态 */}
        {!selectedContact && (
          <div className="hidden flex-1 items-center justify-center sm:flex">
            <ChatEmptyState
              hasContacts={contacts.length > 0}
              title={contacts.length === 0 ? t("emptyTitle") : t("pickContact")}
              sub={t("emptySub")}
              buttonLabel={contacts.length === 0 ? t("findChats") : undefined}
              onFindChats={
                contacts.length === 0 ? () => router.push("/gekaixing/connect_people") : undefined
              }
            />
          </div>
        )}

        {/* 会话线程 */}
        {selectedContact && (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 backdrop-blur sm:px-4">
              <Button
                variant="ghost"
                size="icon"
                className="size-9 shrink-0 rounded-full text-muted-foreground sm:hidden"
                onClick={() => setSelectedContactId("")}
                aria-label={t("back")}
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Avatar className="size-9 shrink-0 ring-1 ring-border/40">
                <AvatarImage
                  src={selectedContact.avatar || "/default-avatar.png"}
                  alt={selectedContact.name}
                />
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-medium text-primary">
                  {selectedContact.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                {selectedContact.participantId ? (
                  <Link
                    href={`/gekaixing/user/${selectedContact.participantId}`}
                    className="block truncate text-[15px] font-semibold tracking-tight hover:underline"
                  >
                    {selectedContact.name}
                  </Link>
                ) : (
                  <h2 className="truncate text-[15px] font-semibold tracking-tight">
                    {selectedContact.name}
                  </h2>
                )}
              </div>
            </header>

            <div className="flex-1 space-y-1 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.3)_100%)] px-4 py-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <ChatEmptyState
                    hasContacts={true}
                    title={t("startChatWith", { name: selectedContact.name })}
                    sub={t("emptySub")}
                  />
                </div>
              ) : (
                renderItems.map((item) =>
                  item.type === "divider" ? (
                    <div key={item.dayKey} className="flex justify-center py-3">
                      <span className="animate-in fade-in rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                        {formatDayLabel(item.dayKey)}
                      </span>
                    </div>
                  ) : (
                    <MessageGroup
                      key={item.messages[0].id}
                      messages={item.messages}
                      isMe={item.messages[0].isMe}
                      myAvatarUrl={myAvatarUrl}
                      contactAvatar={selectedContact.avatar}
                      contactName={selectedContact.name}
                      myLabel={t("me")}
                      formatTime={formatTime}
                    />
                  )
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* 输入区：手机端悬浮在底部导航上方，桌面端自然排布 */}
            <div className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+3.5rem)] pt-2 sm:pb-4 sm:pt-3">
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 p-1.5 transition-all duration-200 focus-within:border-primary/40 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/15">
                <Input
                  placeholder={t("sendTo", { name: selectedContact.name })}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 rounded-full border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
                />
                <Button
                  onClick={() => void handleSendMessage()}
                  disabled={!inputMessage.trim()}
                  size="icon"
                  aria-label={t("send")}
                  className="size-9 shrink-0 rounded-full transition-transform active:scale-95"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** 会话列表头部：标题 + 发起新会话按钮 */
function ListHeader({
  title,
  newLabel,
  onNewMessage,
}: {
  title: string;
  newLabel: string;
  onNewMessage: () => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-4">
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full text-primary hover:bg-primary/10"
        onClick={onNewMessage}
        aria-label={newLabel}
      >
        <SquarePen className="size-5" />
      </Button>
    </div>
  );
}

/** X 风格的会话列表行：头像 + 名字 + 时间 + 消息预览 + 未读 */
function ConversationRow({
  contact,
  active,
  timeLabel,
  onSelect,
}: {
  contact: Contact;
  active: boolean;
  timeLabel: string;
  onSelect: () => void;
}) {
  const unread = contact.unreadCount > 0;
  const nameClass = cn(
    "truncate text-[15px] leading-5",
    unread ? "font-bold text-foreground" : "font-semibold text-foreground/90"
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors",
        active ? "bg-muted/80" : "hover:bg-muted/50"
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="size-12 ring-1 ring-border/50">
          <AvatarImage src={contact.avatar || "/default-avatar.png"} alt={contact.name} />
          <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-base font-medium text-primary">
            {contact.name.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-primary ring-2 ring-background" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          {contact.participantId ? (
            <Link
              href={`/gekaixing/user/${contact.participantId}`}
              onClick={(e) => e.stopPropagation()}
              className={cn(nameClass, "hover:underline")}
            >
              {contact.name}
            </Link>
          ) : (
            <span className={nameClass}>{contact.name}</span>
          )}
          {timeLabel && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{timeLabel}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm leading-5",
              unread ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {contact.lastMessage || ""}
          </span>
          {unread && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none text-primary-foreground">
              {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 一组连续消息的气泡视图（同一发送者、时间相近）。
 * 组内气泡相连，时间只显示在组的末尾。
 */
function MessageGroup({
  messages,
  isMe,
  myAvatarUrl,
  contactAvatar,
  contactName,
  myLabel,
  formatTime,
}: {
  messages: Message[];
  isMe: boolean;
  myAvatarUrl: string;
  contactAvatar?: string;
  contactName: string;
  myLabel: string;
  formatTime: (ts: string) => string;
}) {
  const last = messages[messages.length - 1];
  const tailClass = isMe ? "rounded-br-md" : "rounded-bl-md";
  const firstSenderName = messages[0].senderName || contactName;

  return (
    <div className={cn("flex gap-2", isMe ? "flex-row-reverse items-end" : "items-start")}>
      <Avatar className="mb-0.5 size-7 shrink-0 ring-1 ring-border/40">
        <AvatarImage
          src={
            isMe
              ? myAvatarUrl || "/default-avatar.png"
              : messages[0].senderAvatar || contactAvatar || "/default-avatar.png"
          }
          alt={isMe ? myLabel : firstSenderName}
        />
        <AvatarFallback
          className={cn(
            "text-[10px] font-medium",
            isMe
              ? "bg-muted text-muted-foreground"
              : "bg-gradient-to-br from-primary/20 to-primary/5 text-primary"
          )}
        >
          {(isMe ? myLabel : firstSenderName).slice(0, 2)}
        </AvatarFallback>
      </Avatar>

      <div className={cn("flex max-w-[75%] flex-col", isMe ? "items-end" : "items-start")}>
        {!isMe && (
          <Link
            href={
              messages[0].senderId
                ? `/gekaixing/user/${messages[0].senderId}`
                : "#"
            }
            className="mb-1 px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline"
          >
            {firstSenderName}
          </Link>
        )}
        <div className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            return (
              <div
                key={m.id}
                className={cn(
                  "animate-in fade-in slide-in-from-bottom-1 duration-200",
                  "max-w-full break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                  isMe
                    ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                    : "border border-border/60 bg-background/95 text-foreground",
                  isLast && tailClass
                )}
              >
                {m.content}
              </div>
            );
          })}
        </div>
        <span className="mt-1 px-1 text-[10px] tabular-nums text-muted-foreground/70">
          {formatTime(last.createdAt)}
        </span>
      </div>
    </div>
  );
}

/**
 * 空状态：无消息 / 未选中会话时的友好占位。
 */
function ChatEmptyState({
  hasContacts,
  title,
  sub,
  buttonLabel,
  onFindChats,
}: {
  hasContacts: boolean;
  title: string;
  sub: string;
  buttonLabel?: string;
  onFindChats?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <div className="relative">
        <div className="flex size-20 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent shadow-inner ring-1 ring-border/50">
          <MessageCircle className="size-9 text-primary/80" />
        </div>
        <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Users className="size-3.5" />
        </span>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mx-auto max-w-[260px] text-sm leading-relaxed text-muted-foreground">{sub}</p>
      </div>
      {buttonLabel && onFindChats ? (
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={onFindChats}
        >
          {buttonLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** 取某日 0 点的时间戳（用于会话列表的相对日期计算） */
function startOfDayOf(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
