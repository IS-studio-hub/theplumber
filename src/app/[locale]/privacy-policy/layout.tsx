"use client";

import { AllowPageScroll } from "@/components/layout/AllowPageScroll";

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AllowPageScroll />
      {children}
    </>
  );
}
