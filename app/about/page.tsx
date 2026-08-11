import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { IconBrandGithub } from "@tabler/icons-react"
import { type LucideIcon, Compass, MessageSquare, Radio, Rss, Sparkles, Users } from "lucide-react"
import { getSiteUrl } from "@/lib/site"

type FeatureKey = "feed" | "chat" | "connect" | "explore" | "live" | "ai"
type ValueKey = "who" | "build" | "work"

const GITHUB_URL = "https://github.com/GeKaixing/gekaixing"

const featureKeys: FeatureKey[] = ["feed", "chat", "connect", "explore", "live", "ai"]

const featureIcons: Record<FeatureKey, LucideIcon> = {
  feed: Rss,
  chat: MessageSquare,
  connect: Users,
  explore: Compass,
  live: Radio,
  ai: Sparkles,
}

const valueKeys: ValueKey[] = ["who", "build", "work"]

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("NoirPages.about")
  const title = `${t("title")} · Gekaixing`
  const description = t("description")

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${getSiteUrl()}/about`,
      siteName: "Gekaixing",
      type: "website",
    },
  }
}

export default async function AboutPage(): Promise<React.JSX.Element> {
  const t = await getTranslations("NoirPages.about")
  const common = await getTranslations("NoirPages.common")
  const footer = await getTranslations("FooterLinks")

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "GeKaixing",
    url: `${getSiteUrl()}/about`,
    logo: `${getSiteUrl()}/logo.svg`,
    sameAs: [GITHUB_URL],
  }

  return (
    <main className="min-h-screen bg-background px-6 py-14 text-foreground md:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto w-full max-w-4xl">
        {/* Hero */}
        <header className="flex flex-col items-start gap-5">
          <Image src="/logo.svg" alt="GeKaixing" width={52} height={12} className="h-6 w-auto dark:hidden" priority />
          <Image
            src="/logo-white.svg"
            alt="GeKaixing"
            width={52}
            height={12}
            className="hidden h-6 w-auto dark:block"
            priority
          />
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("badge")}</p>
          <h1 className="max-w-2xl text-4xl font-black tracking-tight md:text-6xl">{t("title")}</h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">{t("description")}</p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/gekaixing"
              className="inline-flex items-center justify-center rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
            >
              {t("hero.ctaStart")}
            </Link>
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
            >
              <IconBrandGithub className="size-4" aria-hidden="true" />
              {t("hero.ctaSource")}
            </Link>
          </div>
        </header>

        {/* Features */}
        <section className="mt-16" aria-labelledby="features-heading">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("features.label")}</p>
          <h2 id="features-heading" className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {t("features.title")}
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featureKeys.map((key: FeatureKey) => {
              const Icon = featureIcons[key]
              return (
                <article key={key} className="rounded-xl border border-border bg-card p-5">
                  <Icon className="size-5" aria-hidden="true" />
                  <h3 className="mt-4 font-semibold">{t(`features.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`features.${key}.description`)}</p>
                </article>
              )
            })}
          </div>
        </section>

        {/* Values */}
        <section className="mt-16" aria-labelledby="values-heading">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("values.label")}</p>
          <h2 id="values-heading" className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {t("values.title")}
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {valueKeys.map((key: ValueKey) => (
              <article key={key} className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold">{t(`values.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`values.${key}.description`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Open source CTA */}
        <section
          className="mt-16 rounded-2xl border border-border bg-card p-8 md:p-10"
          aria-labelledby="opensource-heading"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("openSource.label")}</p>
          <h2 id="opensource-heading" className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {t("openSource.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
            {t("openSource.description")}
          </p>
          <Link
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            <IconBrandGithub className="size-4" aria-hidden="true" />
            {t("openSource.cta")}
          </Link>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-border pt-8">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="Footer">
            <Link href="/tos" className="hover:text-foreground hover:underline">
              {footer("termsOfService")}
            </Link>
            <Link href="/privacy" className="hover:text-foreground hover:underline">
              {footer("privacyPolicy")}
            </Link>
            <Link href="/gekaixing/help" className="hover:text-foreground hover:underline">
              {footer("helpCenter")}
            </Link>
            <Link href="/cookies" className="hover:text-foreground hover:underline">
              {footer("cookiePolicy")}
            </Link>
            <Link href="/accessibility" className="hover:text-foreground hover:underline">
              {footer("accessibility")}
            </Link>
            <Link href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">
              {footer("github")}
            </Link>
          </nav>
          <div className="mt-6">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              {common("backToHome")}
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
