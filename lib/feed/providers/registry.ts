import type { FeedProvider, FeedProviderDeclaration } from "./types";

/**
 * OSP RFC-014: feed-provider registry. Built-in providers are registered here
 * (imported below); third-party providers may call `registerProvider` at module
 * scope. The registry is the single lookup for `getFeedProvider` and the
 * transparency surface for `GET /api/feed/providers`.
 */

const registry = new Map<string, FeedProvider>();

export function registerProvider(provider: FeedProvider): void {
  registry.set(provider.id, provider);
}

/** Get a provider by id; unknown ids fall back to the default "foryou". */
export function getFeedProvider(id: string | null | undefined): FeedProvider {
  if (id && registry.has(id)) {
    return registry.get(id)!;
  }
  return registry.get("foryou")!;
}

/** All registered providers as their public declarations (RFC-014 transparency). */
export function listFeedProviders(): FeedProviderDeclaration[] {
  return Array.from(registry.values()).map(({ compute: _compute, ...declaration }) => declaration);
}

// Register the built-in providers (no self-registration in the provider modules,
// which avoids an import cycle).
import { FollowingProvider } from "./following";
import { ForyouProvider } from "./foryou";
registerProvider(FollowingProvider);
registerProvider(ForyouProvider);
