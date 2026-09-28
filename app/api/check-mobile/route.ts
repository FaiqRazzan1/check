import { NextRequest, NextResponse } from "next/server";
import { runVisualMobileCheck } from "@/lib/mobile-playwright";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = (body?.url || "").toString();
    if (!url) {
      return NextResponse.json({ error: "Field 'url' wajib diisi" }, { status: 400 });
    }
    const width = parseInt((body?.width || "360").toString(), 10);
    const height = parseInt((body?.height || "640").toString(), 10);
    const result = await runVisualMobileCheck(url, width, height);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Tes visual gagal", hint: "Pastikan URL bisa diakses dan Chromium terinstall (npx playwright install chromium)." },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, usage: 'POST /api/check-mobile {"url":"https://contoh.com","width":360,"height":640}' });
}
