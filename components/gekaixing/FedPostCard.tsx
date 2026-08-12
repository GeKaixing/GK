import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Read-only card for federated (remote-country) posts. Content is sanitized
 * server-side on receipt (lib/osp/federation). No like/bookmark/share/reply in
 * v1 — cross-country actions are RFC-012 (deferred).
 */
export interface FedPostCardProps {
  sourceCountryId: string;
  sourceCountryName: string;
  actorId: string;
  did: string;
  content: string | null;
  authorName: string | null;
  authorHandle: string | null;
  authorAvatar: string | null;
  createdAt: string;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FedPostCard(props: FedPostCardProps) {
  const {
    sourceCountryName,
    content,
    authorName,
    authorHandle,
    authorAvatar,
    createdAt,
  } = props;

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <Avatar className="h-10 w-10">
          <AvatarImage src={authorAvatar ?? ""} alt={authorName ?? ""} />
          <AvatarFallback>{(authorName ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{authorName ?? "Unknown"}</span>
            {authorHandle ? (
              <span className="truncate text-sm text-muted-foreground">@{authorHandle}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden>🌍</span>
            <span>{sourceCountryName}</span>
            <span aria-hidden>·</span>
            <span>{formatTime(createdAt)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {/* Safe: sanitized server-side on inbound. */}
        <div
          className="break-words [&_img]:rounded-xl [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: content ?? "" }}
        />
      </CardContent>
    </Card>
  );
}
