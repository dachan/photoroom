import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Photoroom — Browser RAW Developer",
  description: "Edit RAW photos, apply lens corrections, and export JPEGs in the browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col bg-zinc-900 text-zinc-100">{children}</body>
    </html>
  );
}
