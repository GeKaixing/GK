import GoogleButton from "@/components/gekaixing/GoogleButton";
import CookieConsent from "@/components/gekaixing/CookieConsent";
import { LoginFooter } from "@/components/gekaixing/LoginFooter";
import RegistrationProtocol from "@/components/gekaixing/RegistrationProtocol";
import { Separator } from "@/components/ui/separator";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default async function layout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("Account.Layout");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex w-full max-w-5xl items-center justify-center gap-16 lg:justify-between">
          <div className="hidden lg:block">
            <Image className="dark:hidden" src="/logo.svg" alt="Gekaixing logo" width={220} height={220} />
            <Image
              className="hidden dark:block"
              src="/logo-white.svg"
              alt="Gekaixing logo white"
              width={220}
              height={220}
            />
          </div>

          <div className="flex w-full max-w-sm flex-col items-stretch gap-5">
            <div className="mx-auto lg:hidden">
              <Image className="dark:hidden" src="/logo.svg" alt="Gekaixing logo" width={96} height={96} />
              <Image
                className="hidden dark:block"
                src="/logo-white.svg"
                alt="Gekaixing logo white"
                width={96}
                height={96}
              />
            </div>

            <GoogleButton />
            <Separator />
            <RegistrationProtocol />

            <strong className="mt-2 text-center text-sm text-foreground">{t("alreadyHaveAccount")}</strong>

            <Link
              href="/account/login"
              className="flex h-10 w-full items-center justify-center rounded-2xl border border-border text-primary transition-colors hover:bg-muted"
            >
              {t("login")}
            </Link>
            <Link
              href="/account/password_reset"
              className="flex h-10 w-full items-center justify-center rounded-2xl border border-border text-foreground transition-colors hover:bg-muted"
            >
              {t("forgotPassword")}
            </Link>
          </div>
        </div>
      </main>

      <LoginFooter />
      {children}

      <CookieConsent />
    </div>
  );
}
