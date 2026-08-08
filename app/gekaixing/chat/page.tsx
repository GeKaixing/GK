"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Send, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import ArrowLeftBack from "@/components/gekaixing/ArrowLeftBack";
import { useSearchParams } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";

interface Contact {
  id: string;
  name: string;
  avatar?: string;
  unreadCount: number;
  participantId?: string;
  lastMessage?: string;
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
}

interface RealtimeMessage {
  id: string;
  senderId: string;
  conversationId: string;
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const t = useTranslations("ImitationX.ChatPage");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const userIdFromQuery = searchParams.get("userId");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const contactsScrollRef = useRef<HTMLDivElement>(null);
  const [supabase] = useState(() => createClient());
  const creatingConversationRef = useRef<Set<string>>(new Set());

  const selectedContact = contacts.find((c) => c.id === selectedContactId);

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
                ? { ...c, unreadCount: c.unreadCount + 1, lastMessage: newMessage.content }
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
            c.id === selectedContactId ? { ...c, lastMessage: tempMessage.content } : c
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

  const scrollContacts = (direction: "left" | "right") => {
    if (!contactsScrollRef.current) {
      return;
    }

    contactsScrollRef.current.scrollBy({
      left: direction === "left" ? -200 : 200,
      behavior: "smooth",
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleContactSelect = (contactId: string) => {
    setSelectedContactId(contactId);
    setContacts((prev) => prev.map((c) => (c.id === contactId ? { ...c, unreadCount: 0 } : c)));
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-background">
        <div className="rounded-full border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col bg-background">
      <ArrowLeftBack name={t("title")} />

      <div className="relative border-b bg-background/95 backdrop-blur">
        <div className="flex items-center px-2 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full"
            onClick={() => scrollContacts("left")}
          >
            <ChevronLeft className="size-4" />
          </Button>

          <div
            ref={contactsScrollRef}
            className="mx-2 flex-1 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="flex gap-2 px-1">
              {contacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => handleContactSelect(contact.id)}
                  className={cn(
                    "relative flex min-w-[68px] shrink-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-2 transition-all",
                    selectedContactId === contact.id
                      ? "border-primary/30 bg-primary/10 shadow-sm"
                      : "border-transparent hover:border-border hover:bg-muted/70"
                  )}
                >
                  <div className="relative">
                    <Avatar className="size-11 ring-1 ring-border/50">
                      <AvatarImage src={contact.avatar || "/default-avatar.png"} alt={contact.name} />
                      <AvatarFallback className="bg-primary/10 text-sm text-primary">
                        {contact.name.slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    {contact.unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white">
                        {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "max-w-[60px] truncate text-xs",
                      selectedContactId === contact.id ? "font-medium text-primary" : "text-muted-foreground"
                    )}
                  >
                    {contact.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full"
            onClick={() => scrollContacts("right")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {selectedContact ? (
          <>
            <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4">
              <Avatar className="size-9">
                <AvatarImage src={selectedContact.avatar || "/default-avatar.png"} alt={selectedContact.name} />
                <AvatarFallback className="bg-primary/10 text-sm text-primary">
                  {selectedContact.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold tracking-tight">{selectedContact.name}</h2>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.35)_100%)] p-4 pb-28 sm:pb-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-2xl border border-border bg-background/80 px-4 py-3 text-center text-sm text-muted-foreground shadow-sm backdrop-blur">
                    {t("startChatWith", { name: selectedContact.name })}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div key={message.id} className={cn("flex gap-2", message.isMe ? "flex-row-reverse" : "flex-row")}>
                    <Avatar className="size-7 shrink-0">
                      <AvatarImage
                        src={
                          message.isMe
                            ? "/default-avatar.png"
                            : message.senderAvatar || selectedContact.avatar || "/default-avatar.png"
                        }
                        alt={message.isMe ? t("me") : message.senderName || selectedContact.name}
                      />
                      <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                        {message.isMe ? t("me") : (message.senderName || selectedContact.name).slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex max-w-[75%] flex-col">
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm shadow-sm",
                          message.isMe
                            ? "rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-bl-md border border-border/60 bg-background/95"
                        )}
                      >
                        {message.content}
                      </div>
                      <span
                        className={cn(
                          "mt-1 text-[10px] text-muted-foreground",
                          message.isMe ? "text-right" : "text-left"
                        )}
                      >
                        {formatTime(message.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="fixed bottom-[57px] left-0 right-0 z-30 shrink-0 border-t bg-background/95 p-3 backdrop-blur sm:static sm:z-auto sm:bg-background sm:p-3">
              <div className="flex items-center gap-2 rounded-full border border-border bg-muted/30 p-1">
                <Input
                  placeholder={t("sendTo", { name: selectedContact.name })}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <Button onClick={() => void handleSendMessage()} disabled={!inputMessage.trim()} size="icon" className="size-9 rounded-full">
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-muted-foreground">
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm">
              {contacts.length === 0 ? t("emptyContacts") : t("selectContact")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
