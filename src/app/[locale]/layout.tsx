import { CookieConsent } from "@/components/layout/CookieConsent";
import { Header } from "@/components/layout/Header";
import { HtmlLang } from "@/components/layout/HtmlLang";
import { InAppBrowserBanner } from "@/components/layout/InAppBrowserBanner";
import { Preloader } from "@/components/layout/Preloader";
import { ViewportLock } from "@/components/layout/ViewportLock";
import type { Locale } from "@/lib/lisa-types";
import { notFound } from "next/navigation";

const locales: Locale[] = ["en", "fr"];

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!locales.includes(raw as Locale)) notFound();
  const locale = raw as Locale;
  const skipLabel = locale === "fr" ? "Aller au contenu" : "Skip to content";

  return (
    <>
      <ViewportLock />
      <a className="c-skip-link" href="#main-content">
        {skipLabel}
      </a>
      <HtmlLang locale={locale} />
      <Preloader />
      <Header locale={locale} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <InAppBrowserBanner locale={locale} />
      <CookieConsent locale={locale} />
    </>
  );
}
