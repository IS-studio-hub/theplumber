import { LisaApp } from "@/components/lisa/LisaApp";
import type { LisaContent, Locale } from "@/lib/lisa-types";
import { notFound } from "next/navigation";
import en from "@/data/lisa-en.json";
import fr from "@/data/lisa-fr.json";

const locales: Locale[] = ["en", "fr"];

const packs: Record<Locale, LisaContent> = {
  en: en as unknown as LisaContent,
  fr: fr as unknown as LisaContent,
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LisaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!locales.includes(raw as Locale)) notFound();
  const locale = raw as Locale;

  return <LisaApp content={packs[locale]} locale={locale} />;
}
