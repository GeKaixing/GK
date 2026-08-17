import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, queryRawMock, executeRawMock, userUpdateMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  queryRawMock: vi.fn(),
  executeRawMock: vi.fn(),
  userUpdateMock: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: userUpdateMock,
    },
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
  },
}));

import { PATCH } from "@/app/api/auth/profile/route";

describe("PATCH /api/auth/profile", () => {
  beforeEach(() => {
    authMock.mockReset();
    queryRawMock.mockReset();
    executeRawMock.mockReset();
    userUpdateMock.mockReset();
  });

  it("returns 401 when session is missing", async () => {
    authMock.mockResolvedValue(null);

    const request = new Request("http://localhost/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });

    const response = await PATCH(request);
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized");
    expect(userUpdateMock).not.toHaveBeenCalled();
  });

  it("updates email and gemini settings", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    userUpdateMock.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      name: "Tester",
      avatar: null,
    });

    queryRawMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          geminiApiKey: "AIza123",
          geminiModel: "gemini-2.5-flash",
        },
      ]);
    executeRawMock.mockResolvedValue(1);

    const request = new Request("http://localhost/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@example.com",
        data: {
          gemini_api_key: "AIza123",
          gemini_model: "gemini-2.5-flash",
        },
      }),
    });

    const response = await PATCH(request);
    const payload = (await response.json()) as {
      user?: {
        id: string;
        email: string;
        user_metadata?: Record<string, string>;
      };
    };

    expect(response.status).toBe(200);
    expect(userUpdateMock).toHaveBeenCalledTimes(1);
    expect(executeRawMock).toHaveBeenCalledTimes(1);
    expect(queryRawMock).toHaveBeenCalledTimes(2);
    expect(payload.user?.id).toBe("user-1");
    expect(payload.user?.email).toBe("new@example.com");
    expect(payload.user?.user_metadata?.has_gemini_key).toBe(true);
    expect(payload.user?.user_metadata?.gemini_model).toBe("gemini-2.5-flash");
    expect(payload.user?.user_metadata?.gemini_api_key).toBeUndefined();
  });
});
