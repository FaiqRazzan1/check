import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Website Compliance Checker",
  description: "Cek 9 kriteria kepatuhan halaman web + mobile-responsive — 100% = PASS",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
