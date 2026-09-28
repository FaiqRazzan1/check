import { NextRequest, NextResponse } from "next/server";
import { runComplianceCheck } from "@/lib/checker";
import { runBrowserAudit } from "@/lib/audit-playwright";

export const maxDuration = 60; // batas aman Vercel Hobby; cukup untuk mesin statis

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = (body?.url || "").toString();
    if (!url) {
      return NextResponse.json({ error: "Field 'url' wajib diisi" }, { status: 400 });
    }
    const engine = (body?.engine || "static").toString();
    const result = engine === "browser" ? await runBrowserAudit(url) : await runComplianceCheck(url);
    return NextResponse.json({ ...result, engine });
  } catch (e: any) {
    const msg = e?.message || "Gagal menganalisis";
    const isTimeout = /abort|timeout/i.test(msg);
    return NextResponse.json(
      { error: msg, hint: isTimeout ? "Timeout 15 detik — coba lagi atau situs memblokir bot (Cloudflare/JS-rendered, butuh Playwright)." : "Pastikan URL valid, tidak memblokir bot, dan link relatif/absolut benar." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, usage: 'POST /api/check {"url":"https://contoh.com"}' });
}
