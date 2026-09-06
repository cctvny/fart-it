import type { Metadata } from "next";
import { Lilita_One, Quicksand } from "next/font/google";
import "./globals.css";

const shout = Lilita_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-shout",
});

const body = Quicksand({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Fart It!",
  description: "Hit the matching pad before the beat poofs out.",
  icons: { icon: "/fart-it-logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${shout.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
