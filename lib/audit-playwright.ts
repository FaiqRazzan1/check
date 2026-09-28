import { chromium } from "playwright";
import { normalizeUrl, type CheckItem, type CheckResponse } from "./checker";

// Pola fuzzy sama seperti mesin statis (disinkronkan)
const PATTERNS: Record<string, string> = {
  about: "about|tentang|who-we-are",
  dmca: "dmca",
  contact: "contact|hubungi|kontak|reach-us",
  tos: "terms|tos|syarat|ketentuan|terms-of-service|terms-of-use",
  privacy: "privacy|privasi|kebijakan|privacy-policy|data-protection",
};

const LABELS: Record<string, string> = {
  about: "Halaman/link About Us",
  dmca: "Halaman/link DMCA",
  contact: "Halaman/link Contact Us",
  tos: "Halaman/link Terms of Service (ToS)",
  privacy: "Halaman/link Privacy Policy",
};

const FIX: Record<string, string> = {
  logo: "Tambahkan logo di <header> dengan alt tidak kosong.",
  favicon: "Tambahkan favicon dan pastikan file 200 OK.",
  about: "Tambahkan link About di footer/header.",
  dmca: "Tambahkan halaman DMCA.",
  contact: "Tambahkan halaman Contact Us.",
  tos: "Tambahkan halaman Terms of Service.",
  privacy: "Tambahkan halaman Privacy Policy.",
  logohome: "Bungkus logo dengan <a href='/'> agar klik kembali ke home.",
  mobile: "Tambahkan viewport + CSS media query agar mobile-friendly.",
};

const SNIPPET: Record<string, string> = {
  logo: `<header>\n  <a href="/"><img src="/logo.png" alt="NamaBrand Logo" width="160" height="48"></a>\n</header>`,
  favicon: `<link rel="icon" href="/favicon.ico" type="image/x-icon">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
  about: `<footer>\n  <a href="/about">About Us</a>\n</footer>`,
  dmca: `<a href="/dmca">DMCA</a>`,
  contact: `<a href="/contact">Contact Us</a>`,
  tos: `<a href="/terms">Terms of Service</a>`,
  privacy: `<a href="/privacy">Privacy Policy</a>`,
  logohome: `<a href="/"><img src="/logo.png" alt="NamaBrand Logo"></a>`,
  mobile: `<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>\n  img { max-width: 100%; height: auto; }\n  @media (max-width: 768px) {\n    .container { padding: 0 16px; }\n  }\n</style>`,
};

function fail(no: number, key: string, bukti: string, extra = ""): CheckItem {
  return {
    no, key, kriteria: no === 9 ? "Mobile-responsive" : key === "logo" ? "Logo terlihat (alt tidak kosong, >16px)" : key === "favicon" ? "Favicon dapat diakses (HTTP 200)" : key === "logohome" ? "Logo diklik kembali ke Home" : LABELS[key],
    status: "FAIL", bukti, perbaikan: FIX[key] + (extra ? " " + extra : ""), snippet: SNIPPET[key], foundUrl: null,
  };
}

// Cari logo di DOM yang SUDAH di-render + cek visibilitas beneran
const LOGO_JS = `(() => {
  const sels = ['header img','header a img','a > img[class*="logo" i]','img[class*="logo" i]','[class*="logo" i] img','svg[aria-label*="logo" i]','a.brand img','.navbar-brand img'];
  let el = null, sel = '';
  for (const s of sels) { try { const c = document.querySelector(s); if (c) { el = c; sel = s; break; } } catch(e){} }
  if (!el) {
    for (const img of Array.from(document.images)) {
      const blob = ((img.src||'')+' '+(img.alt||'')+' '+(img.className||'')).toLowerCase();
      if (blob.includes('logo')) { el = img; sel = 'img fuzzy "logo"'; break; }
    }
  }
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const tag = el.tagName.toLowerCase();
  const alt = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
  const a = el.closest('a');
  return {
    found: true, tag, sel,
    src: el.getAttribute('src') || '(inline svg)',
    alt, href: a ? a.getAttribute('href') : null,
    w: Math.round(r.width), h: Math.round(r.height),
    visible: r.width > 16 && r.height > 16 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0,
    loaded: tag === 'svg' ? true : (el.complete && el.naturalWidth > 0),
  };
})()`;

export async function runBrowserAudit(rawUrl: string): Promise<CheckResponse> {
  const target = normalizeUrl(rawUrl);
  const t0 = Date.now();
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    const res = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(2000); // SPA hydration / lazy-load
    if ((res?.status() ?? 500) >= 400) throw new Error(`Navigasi gagal: HTTP ${res?.status()}`);
    const finalUrl = page.url();
    const homeUrl = new URL(finalUrl);
    const origin = homeUrl.origin;

    // ---- 1+8. LOGO (render beneran) ----
    const logo: any = await page.evaluate(LOGO_JS);
    let logoPass = false, logoBukti = "Logo tidak ditemukan di DOM render", logoSrc = "", logoHref: string | null = null;
    if (logo?.found) {
      logoHref = logo.href;
      try { logoSrc = logo.src.startsWith("http") ? logo.src : new URL(logo.src, finalUrl).toString(); } catch { logoSrc = logo.src; }
      let srcOk = logo.tag === "svg" ? true : logo.loaded;
      if (logo.tag === "img" && !logo.loaded && logoSrc.startsWith("http")) {
        // gambar belum kelar load → verifikasi via request langsung
        try { const r = await ctx.request.get(logoSrc, { timeout: 10000 }); srcOk = r.ok(); } catch { srcOk = false; }
      }
      const altOk = (logo.alt || "").trim().length > 0;
      logoPass = logo.visible && altOk && srcOk;
      logoBukti = `${logo.tag} selector="${logo.sel}" ${logo.w}×${logo.h}px visible=${logo.visible} loaded=${logo.loaded} srcOk=${srcOk} alt="${logo.alt}"`;
      if (!logo.visible) logoBukti += " | FAIL: tidak terlihat / ≤16px";
      if (!altOk) logoBukti += " | FAIL: alt kosong";
      if (!srcOk) logoBukti += " | FAIL: gambar gagal dimuat";
    }

    // ---- 2. FAVICON (link render + request beneran) ----
    const favHrefs: string[] = await page.evaluate(
      `Array.from(document.querySelectorAll('link[rel*="icon" i]')).map(l => l.getAttribute('href') || '').filter(Boolean)`
    );
    const favCands = [...favHrefs, "/favicon.ico"];
    let favPass = false, favBukti = "tidak ada favicon", favAbs = "";
    for (const c of favCands) {
      try {
        const abs = new URL(c, finalUrl).toString();
        const r = await ctx.request.get(abs, { timeout: 10000 });
        const ct = (r.headers()["content-type"] || "").toLowerCase();
        favBukti = `href="${c}" HTTP ${r.status()} content-type="${ct}"`;
        favAbs = abs;
        if (r.ok() && (ct.includes("image") || ct.includes("icon") || abs.endsWith(".ico"))) { favPass = true; break; }
      } catch (e: any) { favBukti = `href="${c}" error=${e?.message || e}`; }
    }

    // ---- 3-7. FOOTER PAGES (navigasi beneran, bukan cuma fetch) ----
    const checkPage = async (key: string, no: number): Promise<CheckItem> => {
      const found: { text: string; href: string } | null = await page.evaluate((pat: string) => {
        const rx = new RegExp(pat, "i");
        for (const a of Array.from(document.querySelectorAll("a"))) {
          const t = (a.textContent || "").trim();
          const h = a.getAttribute("href") || "";
          if (rx.test(t) || rx.test(h)) return { text: t.slice(0, 60), href: h };
        }
        return null;
      }, PATTERNS[key]);
      if (!found || !found.href || found.href.startsWith("#") || found.href.startsWith("javascript")) {
        return fail(no, key, found ? `teks="${found.text}" tapi href tidak valid` : "Link tidak ditemukan di DOM render");
      }
      let abs = "";
      try { abs = new URL(found.href, finalUrl).toString(); } catch { return fail(no, key, `href tidak bisa di-resolve: ${found.href}`); }
      try {
        const r = await page.goto(abs, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(800);
        const txt: string = await page.evaluate(`(document.body ? document.body.innerText : '').slice(0, 4000)`);
        const title404 = await page.title();
        await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
        const low = (txt + " " + title404).toLowerCase();
        if (!r || !r.ok()) return { ...fail(no, key, `"${found.text}" → ${abs} HTTP ${r?.status()}`, "Link ada tapi mati."), foundUrl: abs };
        if (txt.trim().length < 500 || low.includes("404") || low.includes("page not found") || low.includes("halaman tidak ditemukan")) {
          return { ...fail(no, key, `"${found.text}" → ${abs} HTTP 200 tapi konten ${txt.trim().length} char / terindikasi 404`, "Halaman terdeteksi soft-404."), foundUrl: abs };
        }
        return { no, key, kriteria: LABELS[key], status: "PASS", bukti: `"${found.text}" → ${abs} HTTP 200, ${txt.trim().length}+ char (render)`, perbaikan: "-", foundUrl: abs };
      } catch (e: any) {
        await page.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
        return { ...fail(no, key, `"${found.text}" → ${abs} error: ${e?.message || e}`), foundUrl: abs };
      }
    };
    const pageChecks: CheckItem[] = [];
    const keys = ["about", "dmca", "contact", "tos", "privacy"];
    for (let i = 0; i < keys.length; i++) pageChecks.push(await checkPage(keys[i], i + 3));

    // ---- 8. LOGO → HOME (klik/navigasi beneran) ----
    let homePass = false, homeBukti = "Tidak ada parent <a> pada logo";
    if (logoHref) {
      try {
        const absHome = new URL(logoHref, finalUrl).toString();
        const r = await page.goto(absHome, { waitUntil: "domcontentloaded", timeout: 15000 });
        const landed = page.url();
        const lUrl = new URL(landed);
        homePass = !!r?.ok() && lUrl.origin === origin && (lUrl.pathname === "/" || landed === finalUrl);
        homeBukti = `logo href="${logoHref}" → mendarat ${landed} HTTP ${r?.status()}`;
        if (!homePass) homeBukti += " | FAIL: bukan homepage / tidak 200";
      } catch (e: any) { homeBukti = `logo href="${logoHref}" error: ${e?.message || e}`; }
    }

    // ---- meta dari DOM render ----
    const meta = await page.evaluate(`({
      title: (document.title || '').slice(0, 200),
      desc: (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').slice(0, 300),
      canon: (document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '').slice(0, 300),
      links: document.querySelectorAll('a').length,
      bytes: document.documentElement.outerHTML.length
    })`);
    await ctx.close();

    // ---- 9. MOBILE (viewport kecil beneran, satu browser) ----
    const mctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
    const mp = await mctx.newPage();
    let mobilePass = false, mobileBukti = "gagal ukur mobile";
    try {
      await mp.goto(finalUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      await mp.waitForTimeout(1200);
      const m: any = await mp.evaluate(`(() => {
        const vw = window.innerWidth;
        const over = Math.max(0, document.documentElement.scrollWidth - vw);
        const vp = document.querySelector('meta[name="viewport"]') ? document.querySelector('meta[name="viewport"]').getAttribute('content') : '';
        const cssAll = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join(' ');
        const media = cssAll.split('@media').length - 1;
        return { over, vp, media };
      })()`);
      const vpOk = /width\s*=\s*device-width/i.test(m.vp || "");
      mobilePass = vpOk && m.over === 0 && m.media > 0;
      if (vpOk && m.over === 0 && m.media === 0) mobilePass = true; // halaman simpel tanpa media tapi tidak meluber → terima
      mobileBukti = `render 360px → overflow=${m.over}px viewport=${vpOk ? "ok" : "tidak ada"} @media inline=${m.media}`;
      if (!vpOk) mobileBukti += " | FAIL: tanpa viewport device-width";
      if (m.over > 0) mobileBukti += ` | FAIL: meluber ${m.over}px`;
    } catch (e: any) { mobileBukti = `ukur mobile error: ${e?.message || e}`; }
    await mctx.close();

    const checks: CheckItem[] = [
      { no: 1, key: "logo", kriteria: "Logo terlihat (alt tidak kosong, >16px)", status: logoPass ? "PASS" : "FAIL", bukti: logoBukti + " [browser]", perbaikan: logoPass ? "-" : FIX.logo, snippet: logoPass ? undefined : SNIPPET.logo, foundUrl: logoSrc || null },
      { no: 2, key: "favicon", kriteria: "Favicon dapat diakses (HTTP 200)", status: favPass ? "PASS" : "FAIL", bukti: favBukti + " [browser]", perbaikan: favPass ? "-" : FIX.favicon, snippet: favPass ? undefined : SNIPPET.favicon, foundUrl: favAbs || null },
      ...pageChecks,
      { no: 8, key: "logohome", kriteria: "Logo diklik kembali ke Home", status: homePass ? "PASS" : "FAIL", bukti: homeBukti + " [browser]", perbaikan: homePass ? "-" : FIX.logohome, snippet: homePass ? undefined : SNIPPET.logohome, foundUrl: logoHref ? new URL(logoHref, finalUrl).toString() : null },
      { no: 9, key: "mobile", kriteria: "Mobile-responsive", status: mobilePass ? "PASS" : "FAIL", bukti: mobileBukti + " [browser]", perbaikan: mobilePass ? "-" : FIX.mobile, snippet: mobilePass ? undefined : SNIPPET.mobile, foundUrl: null },
    ];
    const passed = checks.filter((c) => c.status === "PASS").length;
    const score = Math.round((passed * 100) / 9);
    return {
      target, finalUrl, score, status: score === 100 ? "PASS" : "FAIL", checks,
      mobile: { status: mobilePass ? "PASS" : "FAIL", viewport: /device-width/i.test(mobileBukti), viewportContent: "", mediaQueries: 0, mediaSources: ["render browser 360px"], frameworkHints: [], redFlags: [], bukti: mobileBukti, perbaikan: mobilePass ? "-" : FIX.mobile, snippet: mobilePass ? undefined : SNIPPET.mobile },
      meta: { title: (meta as any).title, description: (meta as any).desc, canonical: (meta as any).canon, loadMs: Date.now() - t0, htmlBytes: (meta as any).bytes, linkCount: (meta as any).links },
    };
  } finally {
    await browser.close();
  }
}
