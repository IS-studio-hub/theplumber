import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Outfit } from "next/font/google";
import "./globals.css";

const ui = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-ui-family",
  display: "swap",
});

const display = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-display-family",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: "AVA | Sewer Squad",
  description:
    "AVA helps Sewer Squad customers with emergencies, quotes, and bookings for plumbing and drains across the GTA, 24/7.",
  applicationName: "AVA",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    title: "AVA | Sewer Squad",
    description:
      "Chat with AVA for Sewer Squad: emergencies, quotes, and bookings across the GTA.",
    siteName: "AVA | Sewer Squad",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AVA | Sewer Squad",
    description:
      "Chat with AVA for Sewer Squad: emergencies, quotes, and bookings across the GTA.",
  },
  icons: {
    icon: [
      { url: "/assets/images/favicons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/assets/images/favicons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/assets/images/favicons/favicon.jpg", sizes: "48x48", type: "image/jpeg" },
    ],
    shortcut: "/assets/images/favicons/favicon-32x32.png",
    apple: [
      { url: "/assets/images/favicons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "X-Content-Type-Options": "nosniff",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="lisa"
      data-template="lisa"
      className={`${ui.variable} ${display.variable}`}
    >
      <head>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      </head>
      <body>{children}</body>
    </html>
  );
}
