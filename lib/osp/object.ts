/**
 * OSP RFC-005: the common object model. Lightweight mapping in 3.0.0 — the
 * app's domain tables (Post, Message, JobPosting, LiveStream, ...) already ARE
 * Objects; this provides the canonical type discriminators and ref shape used
 * by the event ledger and export.
 */
export const OBJECT_TYPES = {
  POST: "post",
  COMMENT: "comment",
  MEDIA: "media",
  PROFILE: "profile",
  MESSAGE: "message",
  CAPABILITY: "capability",
  PASSPORT: "passport",
  LIVE_STREAM: "live_stream",
  JOB_POSTING: "job_posting",
  ACTOR: "actor",
} as const;

export type OspObjectType = (typeof OBJECT_TYPES)[keyof typeof OBJECT_TYPES];

/** The canonical { type, id } object reference carried by events. */
export function toOspObjectRef(type: string, id: string): { type: string; id: string } {
  return { type, id };
}
