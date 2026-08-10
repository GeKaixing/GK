import { describe, expect, it } from "vitest";

import { buildPiProvider, createPiAgent, createPiTools } from "@/lib/ai/pi";
import type { AiUserConfig } from "@/lib/ai/types";

const openaiConfig: AiUserConfig = {
  provider: "openai",
  apiKey: "sk-test",
  model: "gpt-4o",
};

describe("createPiTools", () => {
  it("registers webSearch and fetchUrl with schemas and executors", () => {
    const tools = createPiTools();
    expect(tools.map((t) => t.name)).toEqual(["webSearch", "fetchUrl"]);
    for (const tool of tools) {
      expect(tool.label).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe("function");
    }
  });
});

describe("buildPiProvider", () => {
  it("exposes the user's model and resolves the user's apiKey", async () => {
    const provider = buildPiProvider(openaiConfig);
    const models = provider.getModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("gpt-4o");
    expect(models[0].provider).toBe("openai");

    const auth = await provider.auth.apiKey?.resolve({
      ctx: {} as never,
      signal: new AbortController().signal,
    });
    expect(auth?.auth.apiKey).toBe("sk-test");
  });

  it("uses config.baseURL for compatible providers", () => {
    const provider = buildPiProvider({
      provider: "openai-compatible",
      apiKey: "k",
      model: "deepseek-chat",
      baseURL: "https://api.deepseek.com/v1",
    });
    expect(provider.getModels()[0].baseUrl).toBe("https://api.deepseek.com/v1");
    expect(provider.getModels()[0].api).toBe("openai-completions");
  });
});

describe("createPiAgent", () => {
  it("builds a bound agent with the user's model and web tools", () => {
    const { agent, models } = createPiAgent(openaiConfig);
    expect(models.getModel("openai", "gpt-4o")).toBeDefined();
    expect(agent.state.model.id).toBe("gpt-4o");
    expect(agent.state.tools.map((t) => t.name)).toEqual(["webSearch", "fetchUrl"]);
  });
});
