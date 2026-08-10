import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiUserConfig } from "./types";

const mockStreamText = vi.fn();

vi.mock("ai", () => ({
  generateText: vi.fn(),
  streamText: (...args: unknown[]) => mockStreamText(...args),
}));

vi.mock("./models", () => ({
  getModelCandidates: () => ["test-model"],
}));

vi.mock("./providers", () => ({
  buildLanguageModel: () => ({}),
}));

import { streamAiText } from "./text";

const config: AiUserConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "test-model",
};

async function collect(generator: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const chunk of generator) out += chunk;
  return out;
}

function mockResult(texts: string[]) {
  return {
    textStream: (async function* () {
      for (const text of texts) yield text;
    })(),
  };
}

/** Returns the first argument of the LAST streamText call (the final/fallback params). */
function streamParams() {
  return mockStreamText.mock.calls.at(-1)![0] as { tools?: unknown };
}

describe("streamAiText tool fallback", () => {
  beforeEach(() => {
    mockStreamText.mockReset();
  });

  it("yields the answer when the tools pass produces text", async () => {
    mockStreamText.mockImplementation((params: { tools?: unknown }) =>
      params.tools ? mockResult(["tool answer"]) : mockResult(["fallback"])
    );

    const out = await collect(
      streamAiText(config, { messages: [], tools: {}, maxSteps: 2 })
    );

    expect(out).toBe("tool answer");
    expect(mockStreamText).toHaveBeenCalledTimes(1);
  });

  it("falls back to a no-tools call when the tools pass yields no text", async () => {
    mockStreamText.mockImplementation((params: { tools?: unknown }) =>
      params.tools ? mockResult([]) : mockResult(["fallback answer"])
    );

    const out = await collect(
      streamAiText(config, { messages: [], tools: {}, maxSteps: 2 })
    );

    expect(out).toBe("fallback answer");
    expect(mockStreamText).toHaveBeenCalledTimes(2);
    // The second (successful) call must not carry tools.
    expect(streamParams().tools).toBeUndefined();
  });

  it("falls back to a no-tools call when the tools pass throws", async () => {
    mockStreamText.mockImplementation((params: { tools?: unknown }) => {
      if (params.tools) throw new Error("tools unsupported");
      return mockResult(["fallback answer"]);
    });

    const out = await collect(
      streamAiText(config, { messages: [], tools: {}, maxSteps: 2 })
    );

    expect(out).toBe("fallback answer");
    expect(mockStreamText).toHaveBeenCalledTimes(2);
  });
});
