import type { FeedTab } from "@/lib/feed/types";

/**
 * OSP RFC-014: Feed providers — separates DATA OWNERSHIP (the repository) from
 * RANKING & PRESENTATION. A provider declares its data sources, ranking signals,
 * moderation interactions and policies (transparency), and computes a ranked
 * post-id list from the repository.
 */

export interface FeedProviderDeclaration {
  /** Provider id. Matches FeedTab for the built-in providers ("foryou" | "following"). */
  id: string;
  name: string;
  description: string;
  /** Declared data sources this provider reads (transparency). */
  dataSources: string[];
  /** Declared ranking signals this provider scores on. */
  rankingSignals: string[];
  /** Declared moderation interactions (e.g. the Customs pipeline steps). */
  moderation: string[];
  /** Declared policies applied to the ranking. */
  policies: string[];
}

export interface FeedProvider extends FeedProviderDeclaration {
  /** Compute a ranked list of post ids for the viewer (null = guest). */
  compute(userId: string | null): Promise<string[]>;
}

/** Resolve the provider id for a feed tab. */
export function providerIdForTab(tab: FeedTab): string {
  return tab;
}
