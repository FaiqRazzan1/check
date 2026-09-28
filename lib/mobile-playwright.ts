import { chromium } from "playwright";
import { normalizeUrl } from "./checker";

export type VisualMobileResult = {
  url: string;
  finalUrl: string;
  viewport: { width: number; height: number };
  loadMs: number;
  hasHorizontalOverflow: boolean;
  overflowPx: number;
  overflowingElements: string[];
  smallTapTargets: number;
  screenshot: string | null; // base64 PNG (viewport)
  status: "PASS" | "FAIL";
  bukti: string;
};

export async function runVisualMobileCheck(
  rawUrl: string,
  width = 360,
  height = 640
): Promise<VisualMobileResult> {
  const url = normalizeUrl(rawUrl);
  const w = Math.min(Math.max(width || 360, 280), 1024);
  const h = Math.min(Math.max(height || 640, 400), 1600);
  const t0 = Date.now();
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1500); // beri waktu layout shift / font
    const finalUrl = page.url();
    const status_code = res?.status() ?? 0;
    if (status_code >= 400) {
      throw new Error(`Navigasi gagal: HTTP ${status_code}`);
    }
    const measured = await page.evaluate((vw: number) => {
      const doc = document.documentElement;
      const overflowPx = Math.max(0, doc.scrollWidth - vw);
      const bad: string[] = [];
      const els = Array.from(document.querySelectorAll("body *"));
      for (const el of els) {
        if (bad.length >= 5) break;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.right > vw + 1 || r.left < -1) {
          const tag = el.tagName.toLowerCase();
          const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
          const cls = ((el as HTMLElement).className || "").toString().split(/\s+/).slice(0, 2).join(".");
          bad.push(`${tag}${id}${cls ? "." + cls : ""} (right=${Math.round(r.right)}px)`);
        }
      }
      let small = 0;
      const taps = Array.from(document.querySelectorAll("a, button"));
      for (const el of taps) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        if (r.width < 24 || r.height < 24) {
          small++;
          if (small >= 200) break;
        }
      }
      return { overflowPx, bad, small };
    }, w);
    const shot = await page.screenshot({ type: "png" });
    const hasOverflow = measured.overflowPx > 0;
    const pass = !hasOverflow;
    return {
      url,
      finalUrl,
      viewport: { width: w, height: h },
      loadMs: Date.now() - t0,
      hasHorizontalOverflow: hasOverflow,
      overflowPx: measured.overflowPx,
      overflowingElements: measured.bad,
      smallTapTargets: measured.small,
      screenshot: shot.toString("base64"),
      status: pass ? "PASS" : "FAIL",
      bukti:
        `viewport ${w}×${h} → scrollWidth melebihi ${measured.overflowPx}px | ` +
        `elemen meluber: [${measured.bad.join("; ") || "-"}] | ` +
        `tap-target kecil (<24px): ${measured.small}`,
    };
  } finally {
    await browser.close();
  }
}
