import { describe, expect, it } from "vitest";
import { allowingCustoms, runCustoms, type CustomsPipeline, type CustomsResult } from "./customs";

const req = { actorId: "actor-1", objectType: "post", content: "hello" };

function pipeline(name: string, decision: CustomsResult["decision"]): CustomsPipeline {
  return {
    name,
    run: async () => ({ decision, checks: [name] }),
  };
}

describe("runCustoms", () => {
  it("ALLOWs when all pipelines allow", async () => {
    const result = await runCustoms(req, [allowingCustoms, pipeline("size", "ALLOW")]);
    expect(result.decision).toBe("ALLOW");
    expect(result.checks).toEqual(["allowing_customs", "size"]);
  });

  it("DENY wins over everything", async () => {
    const result = await runCustoms(req, [
      allowingCustoms,
      pipeline("nsfw", "RESTRICT"),
      pipeline("spam", "DENY"),
      pipeline("quarantine", "QUARANTINE"),
    ]);
    expect(result.decision).toBe("DENY");
    expect(result.reason).toBeUndefined();
  });

  it("QUARANTINE beats RESTRICT and ALLOW", async () => {
    const result = await runCustoms(req, [
      allowingCustoms,
      pipeline("nsfw", "RESTRICT"),
      pipeline("quarantine", "QUARANTINE"),
    ]);
    expect(result.decision).toBe("QUARANTINE");
  });

  it("RESTRICT beats ALLOW", async () => {
    const result = await runCustoms(req, [allowingCustoms, pipeline("nsfw", "RESTRICT")]);
    expect(result.decision).toBe("RESTRICT");
  });

  it("collects all check names regardless of outcome", async () => {
    const result = await runCustoms(req, [
      pipeline("a", "ALLOW"),
      pipeline("b", "DENY"),
      pipeline("c", "ALLOW"),
    ]);
    expect(result.checks.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("allowingCustoms", () => {
  it("always allows", async () => {
    expect(await allowingCustoms.run(req)).toEqual({
      decision: "ALLOW",
      checks: ["allowing_customs"],
    });
  });
});
