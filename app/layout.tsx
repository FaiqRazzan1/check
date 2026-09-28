import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Website Compliance Checker",
  description: "Cek 8 kriteria kepatuhan halaman web — skor 100% = PASS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-slate-950 text-slate-100">{children}</body>
    </html>
  );
}
