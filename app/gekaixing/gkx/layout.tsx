import type { ReactNode } from "react";
import GkxAiSidebarServer from "@/components/gekaixing/GkxAiSidebarServer";

/**
 * gkx 聊天页布局（Grok 风格）：左侧会话历史栏 + 中央聊天区。
 */
export default async function GkxLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full">
      <aside className="hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 overflow-y-auto border-r p-3 md:block">
        <GkxAiSidebarServer />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
