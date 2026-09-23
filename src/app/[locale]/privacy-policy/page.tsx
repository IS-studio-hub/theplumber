import type { Locale } from "@/lib/lisa-types";
import { notFound } from "next/navigation";
import Link from "next/link";

const locales: Locale[] = ["en", "fr"];

const copy = {
  en: {
    title: "Privacy policy",
    body: [
      "This site includes a lightweight privacy notice for cookie consent.",
      "Essential cookies support language preference and preloader timing. Analytics cookies are optional and not loaded unless accepted.",
      "Form submissions are handled by this app’s local API for demo purposes and are not sent to third-party marketing systems unless you configure them to.",
    ],
    back: "Back to Dooogs!",
  },
  fr: {
    title: "Politique de confidentialité",
    body: [
      "Ce site inclut un avis de confidentialité léger pour le consentement aux cookies.",
      "Les cookies essentiels gèrent la langue et le préchargeur. Les cookies analytiques sont optionnels.",
      "Les envois de formulaires passent par l’API locale de cette démo et ne sont pas transmis à des systèmes marketing tiers sauf configuration contraire.",
    ],
    back: "Retour à Dooogs!",
  },
} as const;

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!locales.includes(raw as Locale)) notFound();
  const locale = raw as Locale;
  const t = copy[locale];

  return (
    <article className="c-privacy">
      <h1>{t.title}</h1>
      {t.body.map((p) => (
        <p key={p}>{p}</p>
      ))}
      <p>
        <Link href={`/${locale}`}>{t.back}</Link>
      </p>
    </article>
  );
}
