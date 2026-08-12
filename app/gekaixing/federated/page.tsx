import ArrowLeftBack from "@/components/gekaixing/ArrowLeftBack";
import FedPostCard from "@/components/gekaixing/FedPostCard";
import { FedInboundStatus, RecognitionState } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { COUNTRY_ID } from "@/lib/osp";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * OSP RFC-009 federated surface: admitted public posts from RECOGNIZED/TRUSTED
 * peer countries, newest first. Read-only in v1.
 */
export default async function FederatedPage() {
  const t = await getTranslations("ImitationX.Federated");

  const objects = await prisma.fedObject.findMany({
    where: {
      status: FedInboundStatus.ADMITTED,
      remoteCountry: {
        status: "ACTIVE",
        recognitions: {
          some: {
            fromCountryId: COUNTRY_ID,
            state: { in: [RecognitionState.RECOGNIZED, RecognitionState.TRUSTED] },
          },
        },
      },
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: 50,
    include: { remoteCountry: { select: { id: true, name: true } } },
  });

  return (
    <div>
      <ArrowLeftBack name={t("title")} />
      <div className="space-y-3 px-4 py-3">
        {objects.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          objects.map((o) => (
            <FedPostCard
              key={o.id}
              sourceCountryId={o.sourceCountryId}
              sourceCountryName={o.remoteCountry?.name ?? o.sourceCountryId}
              actorId={o.actorId}
              did={`did:osp:${o.sourceCountryId}:${o.actorId}`}
              content={o.content}
              authorName={o.authorName}
              authorHandle={o.authorHandle}
              authorAvatar={o.authorAvatar}
              createdAt={o.createdAt.toISOString()}
            />
          ))
        )}
      </div>
    </div>
  );
}
