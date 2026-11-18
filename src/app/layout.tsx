import type { Metadata, Viewport } from "next";
import { Overpass, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { FeedbackWidget } from "@/components/FeedbackWidget";

const overpass = Overpass({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-overpass",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "All About Nigeria: the survival guide",
  description:
    "Plain-language guides, interactive tools, and real OpenStreetMap 3D voxel maps covering all 36 Nigerian states, Abuja FCT, and 16 university campuses.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${overpass.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#0b1620] text-[#e9e5db] antialiased selection:bg-[#00a862]/30 selection:text-white">
        {children}
        <FeedbackWidget />
      </body>
    </html>
  );
}
