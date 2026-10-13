import type { Metadata } from "next";
import { Inter, Roboto_Flex } from "next/font/google";
import "./globals.css";

// SF Pro via system-ui on Apple devices; Inter as the documented open-source substitute elsewhere.
const inter = Inter({ subsets: ["latin"], variable: "--font-ui" });
// Captions: Roboto Flex variable font (wght 100–1000, wdth 25–151) for expressive typography.
const flex = Roboto_Flex({ subsets: ["latin"], variable: "--font-flex", axes: ["wdth", "opsz"] });

export const metadata: Metadata = { title: "Caption Mirror", description: "Captions that show how something is said" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${flex.variable}`}>
      <body>{children}</body>
    </html>
  );
}
