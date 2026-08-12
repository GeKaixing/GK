/**
 * OSP internal SDK (RFC-016, server-side layers: Identity/Passport/Event/
 * Capability/Customs). This is the reference implementation's protocol core,
 * consumed by API routes and the bootstrap script. A public @osp/* npm SDK is
 * deferred to a later version.
 */
export * from "./actor";
export * from "./capability";
export * from "./country";
export * from "./customs";
export * from "./did";
export * from "./event";
export * from "./federation";
export * from "./keys";
export * from "./object";
export * from "./passport";

/** Data-export manifest schema version (RFC-008). */
export const OSP_SCHEMA_VERSION = "osp/export/v1";
