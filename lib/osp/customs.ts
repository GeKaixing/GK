/**
 * OSP RFC-010: Customs — the admission pipeline for Objects entering a Country.
 *
 * 3.0.0 lands the INTERFACE and decision model (RFC-010 standardizes the process
 * and exchange format, not the policy). Only the pass-through `allowingCustoms`
 * pipeline is registered, so wiring this into post/reply creation changes
 * nothing today. Real admission policies (text/image/audio analysis, language
 * detection, policy evaluation) plug in as additional pipelines later.
 */

export type CustomsDecision = "ALLOW" | "RESTRICT" | "DENY" | "QUARANTINE";

export interface CustomsRequest {
  actorId: string;
  objectType: string;
  objectId?: string | null;
  content?: string | null;
}

export interface CustomsResult {
  decision: CustomsDecision;
  reason?: string;
  /** Names of the checks that ran (RFC-010 pipeline steps). */
  checks: string[];
}

export interface CustomsPipeline {
  name: string;
  run(req: CustomsRequest): Promise<CustomsResult>;
}

/**
 * Run an object through the pipeline. Severity wins: DENY > QUARANTINE > RESTRICT > ALLOW.
 */
export async function runCustoms(
  req: CustomsRequest,
  pipelines: CustomsPipeline[]
): Promise<CustomsResult> {
  const results = await Promise.all(pipelines.map((p) => p.run(req)));
  const checks = results.flatMap((r) => r.checks);
  for (const decision of ["DENY", "QUARANTINE", "RESTRICT"] as const) {
    const hit = results.find((r) => r.decision === decision);
    if (hit) {
      return { decision, reason: hit.reason, checks };
    }
  }
  return { decision: "ALLOW", checks };
}

/** The v1 placeholder pipeline: admit everything, no policy. */
export const allowingCustoms: CustomsPipeline = {
  name: "allowing",
  run: async () => ({ decision: "ALLOW", checks: ["allowing_customs"] }),
};

/** The default pipeline set for post/reply creation in 3.0.0. */
export const DEFAULT_CUSTOMS_PIPELINES: CustomsPipeline[] = [allowingCustoms];
