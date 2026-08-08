import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: getUserMock,
    },
  })),
}));

vi.mock("@/lib/ai/text", () => ({
  generateAiText: vi.fn(),
}));

import { POST } from "@/app/api/post/ai/route";

describe("POST /api/post/ai", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({
      data: {
        user: { id: "user-1", user_metadata: {} },
      },
    });
  });

  it("returns 503 when AI API key is missing instead of local fallback content", async () => {
    const request = new Request("http://localhost/api/post/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Write a post about testing",
        locale: "en",
      }),
    });

    const response = await POST(request);
    const payload = (await response.json()) as {
      success?: boolean;
      error?: string;
      content?: string;
      source?: string;
    };

    expect(response.status).toBe(503);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe("AI API key is not configured in your Settings");
    expect(payload.content).toBeUndefined();
    expect(payload.source).toBeUndefined();
  });
});
