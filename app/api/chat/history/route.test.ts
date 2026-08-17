import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, findUniqueMock, findManyMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  findUniqueMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    chatAISession: {
      findUnique: findUniqueMock,
    },
    chatAIMessage: {
      findMany: findManyMock,
    },
  },
}));

import { GET } from "@/app/api/chat/history/route";

describe("GET /api/chat/history", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
    findManyMock.mockReset();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/chat/history?sessionId=session-1"));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized");
    expect(findUniqueMock).not.toHaveBeenCalled();
  });

  it("returns 403 when the session belongs to another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    findUniqueMock.mockResolvedValue({ userId: "user-2" });

    const response = await GET(new Request("http://localhost/api/chat/history?sessionId=session-1"));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(403);
    expect(payload.error).toBe("Forbidden");
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns messages for the current user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    findUniqueMock.mockResolvedValue({ userId: "user-1" });
    findManyMock.mockResolvedValue([
      { id: "m-1", role: "user", content: "hello" },
      { id: "m-2", role: "assistant", content: "hi" },
    ]);

    const response = await GET(new Request("http://localhost/api/chat/history?sessionId=session-1"));
    const payload = (await response.json()) as Array<{ id: string; role: string; content: string }>;

    expect(response.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(payload).toHaveLength(2);
    expect(payload[0]?.content).toBe("hello");
  });
});
