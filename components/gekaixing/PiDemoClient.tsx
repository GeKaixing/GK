"use client";

import { useRef, useState } from "react";
import MessageBubble from "@/components/gekaixing/MessageBubble";

/**
 * Minimal demo UI for the /api/pi-demo route (Pi agent harness).
 * Sends one user message, then renders Pi's SSE event stream:
 * text deltas as the reply, tool calls as chips, turn/agent ends as separators.
 */

interface SseData {
  delta?: string;
  tool?: string;
  args?: unknown;
  isError?: boolean;
  message?: string;
  systemPrompt?: string;
}

type Row =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; tool: string; done?: boolean; error?: boolean; argsText?: string }
  | { kind: "meta"; text: string }
  | { kind: "error"; text: string };

function parseSseBlock(block: string): { event: string; data?: SseData } | null {
  const event = block.match(/^event: (.+)$/m)?.[1];
  const dataLine = block.match(/^data: (.+)$/m)?.[1];
  if (!dataLine) return null;
  try {
    return { event: event ?? "message", data: JSON.parse(dataLine) as SseData };
  } catch {
    return { event: event ?? "message", data: { delta: dataLine } };
  }
}

export default function PiDemoClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const bufferRef = useRef("");

  const run = async () => {
    const text = input.trim();
    if (!text || running) return;

    setInput("");
    bufferRef.current = "";
    setRows((prev) => [...prev, { kind: "user", text }, { kind: "assistant", text: "" }]);
    setRunning(true);

    const appendAssistant = (delta: string) =>
      setRows((prev) => {
        const next = prev.slice();
        const last = next[next.length - 1];
        if (last?.kind === "assistant") {
          next[next.length - 1] = { kind: "assistant", text: last.text + delta };
        } else {
          next.push({ kind: "assistant", text: delta });
        }
        return next;
      });

    try {
      const res = await fetch("/api/pi-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
      });

      if (!res.ok) {
        const errText = (await res.text()).trim();
        throw new Error(errText || `Request failed (HTTP ${res.status})`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const handle = (event: string, data: SseData) => {
        switch (event) {
          case "text_delta":
            appendAssistant(data.delta ?? "");
            break;
          case "tool_start":
            setRows((prev) => [
              ...prev,
              {
                kind: "tool",
                tool: data.tool ?? "?",
                ...(data.args ? { argsText: JSON.stringify(data.args) } : {}),
              },
            ]);
            break;
          case "tool_end":
            setRows((prev) => {
              const next = prev.slice();
              for (let i = next.length - 1; i >= 0; i--) {
                const row = next[i];
                if (row.kind === "tool" && row.tool === data.tool && !row.done) {
                  next[i] = { ...row, done: true, error: data.isError };
                  break;
                }
              }
              return next;
            });
            break;
          case "turn_end":
            setRows((prev) => [...prev, { kind: "meta", text: "— turn —" }]);
            break;
          case "agent_end":
            setRows((prev) => [...prev, { kind: "meta", text: "✓ agent done" }]);
            break;
          case "error":
            setRows((prev) => [...prev, { kind: "error", text: data.message ?? "Unknown error" }]);
            break;
          default:
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bufferRef.current += decoder.decode(value, { stream: true });
        const blocks = bufferRef.current.split("\n\n");
        bufferRef.current = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (parsed?.data) handle(parsed.event, parsed.data);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRows((prev) => [...prev, { kind: "error", text: msg }]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">GKX × Pi Agent demo</h1>
        <p className="text-sm text-muted-foreground">
          Runs the @earendil-works/pi agent with your configured model + webSearch/fetchUrl tools.
          Try “最近有什么新闻” or “2026年奥运会在哪举行”.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Type a message below to start.</p>
        )}
        {rows.map((row, i) => {
          if (row.kind === "user" || row.kind === "assistant")
            return (
              <MessageBubble
                key={i}
                role={row.kind}
                content={row.text}
                loading={row.kind === "assistant" && running && !row.text}
              />
            );
          if (row.kind === "tool")
            return (
              <div key={i} className="self-start rounded border px-2 py-1 text-xs text-muted-foreground">
                {row.error ? "✗" : row.done ? "✓" : "🔍"} {row.tool}
                {row.argsText ? `(${row.argsText})` : ""}
                {row.done && !row.error ? " done" : ""}
              </div>
            );
          if (row.kind === "meta")
            return (
              <div key={i} className="self-center text-xs text-muted-foreground">
                {row.text}
              </div>
            );
          return (
            <div key={i} className="self-start rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-500">
              {row.text}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="Ask the Pi agent… (Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => void run()}
          disabled={running || !input.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? "Running…" : "Send"}
        </button>
      </div>
    </div>
  );
}
