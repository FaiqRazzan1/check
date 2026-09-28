import * as cheerio from "cheerio";

export type CheckItem = {
  no: number;
  key: string;
  kriteria: string;
  status: "PASS" | "FAIL";
  bukti: string;
  perbaikan: string;
  snippet?: string;
  foundUrl?: string | null;
};

export type MobileCheck = {
  status: "PASS" | "FAIL";
  viewport: boolean;
  viewportContent: string;
  mediaQueries: number;
  mediaSources: string[];
  frameworkHints: string[];
  redFlags: string[];
  bukti: string;
  perbaikan: string;
  snippet?: string;
};

export type CheckResponse = {
  target: string;
  finalUrl: string;
  score: number;
  status: "PASS" | "FAIL";
  checks: CheckItem[];
  mobile: MobileCheck;
  meta: {
    title: string;
    description: string;
    canonical: string;
    loadMs: number;
    htmlBytes: number;
    linkCount: number;
  };
};

export function normalizeUrl(input: string): string {
  let u = (input || "").trim();
  if (!u) throw new Error("URL kosong");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  // validasi
  const parsed = new URL(u);
  if (!parsed.hostname.includes(".")) throw new Error("Hostname tidak valid");
  return parsed.toString();
}

async function fetchWithTimeout(url: string, timeoutMs = 15000, method = "GET") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (ComplianceChecker/1.0; +https://localhost) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,image/*,*/*;q=0.8",
      },
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

const LINK_PATTERNS: Record<string, RegExp> = {
  about: /about|tentang|tentang-kami|about-us|who-we-are/i,
  dmca: /dmca/i,
  contact: /contact|hubungi|kontak|contact-us|reach-us/i,
  tos: /terms|tos|syarat|ketentuan|terms-of-service|terms-of-use/i,
  privacy: /privacy|privasi|kebijakan|privacy-policy|data-protection/i,
};

const FIX_SNIPPETS: Record<string, { perbaikan: string; snippet: string }> = {
  logo: {
    perbaikan: "Tambahkan logo di <header> dengan alt tidak kosong.",
    snippet: `<header>\n  <a href="/"><img src="/logo.png" alt="NamaBrand Logo" width="160" height="48"></a>\n</header>`,
  },
  favicon: {
    perbaikan: "Tambahkan favicon dan pastikan file 200 OK.",
    snippet: `<link rel="icon" href="/favicon.ico" type="image/x-icon">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
  },
  about: {
    perbaikan: "Tambahkan link About di footer/header.",
    snippet: `<footer>\n  <a href="/about">About Us</a>\n</footer>`,
  },
  dmca: {
    perbaikan: "Tambahkan halaman DMCA.",
    snippet: `<a href="/dmca">DMCA</a>`,
  },
  contact: {
    perbaikan: "Tambahkan halaman Contact Us.",
    snippet: `<a href="/contact">Contact Us</a>`,
  },
  tos: {
    perbaikan: "Tambahkan halaman Terms of Service.",
    snippet: `<a href="/terms">Terms of Service</a>`,
  },
  privacy: {
    perbaikan: "Tambahkan halaman Privacy Policy.",
    snippet: `<a href="/privacy">Privacy Policy</a>`,
  },
  logohome: {
    perbaikan: "Bungkus logo dengan <a href='/'> agar klik kembali ke home.",
    snippet: `<a href="/"><img src="/logo.png" alt="NamaBrand Logo"></a>`,
  },
  mobile: {
    perbaikan: "Tambahkan viewport + CSS media query agar mobile-friendly.",
    snippet: `<meta name="viewport" content="width=device-width, initial-scale=1">\n<style>\n  img { max-width: 100%; height: auto; }\n  @media (max-width: 768px) {\n    .container { padding: 0 16px; }\n    nav ul { flex-direction: column; }\n  }\n</style>`,
  },
};

function isSoft404(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("404 not found") ||
    t.includes("page not found") ||
    t.includes("halaman tidak ditemukan") ||
    t.length < 500
  );
}

export async function runComplianceCheck(rawUrl: string): Promise<CheckResponse> {
  const target = normalizeUrl(rawUrl);
  const t0 = Date.now();
  // Retry 1x untuk kegagalan transient (timeout/abort) — kurangi false-FAIL
  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetchWithTimeout(target, 15000);
      break;
    } catch (e: any) {
      lastErr = e?.message || "fetch gagal";
      if (!/abort|timeout|timed out|network|fetch failed|econn/i.test(lastErr)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!res) throw new Error(`Fetch homepage gagal: ${lastErr}`);
  let finalUrl = res.url || target;
  if (!res.ok) throw new Error(`Fetch homepage gagal: HTTP ${res.status}`);
  let html = await res.text();
  // Ikuti meta-refresh redirect 1 hop (mis. halaman parkir/splash) — tanpa browser
  const $first = cheerio.load(html);
  let refresh = "";
  $first("meta[http-equiv]").each((_, el) => {
    if ((($first(el).attr("http-equiv") || "").toLowerCase() === "refresh")) {
      refresh = $first(el).attr("content") || "";
    }
  });
  const mRefresh = refresh.match(/url\s*=\s*(.+)/i);
  if (mRefresh) {
    try {
      const abs = new URL(mRefresh[1].trim().replace(/^['"]|['"]$/g, ""), finalUrl).toString();
      const r2 = await fetchWithTimeout(abs, 12000);
      if (r2.ok) {
        finalUrl = r2.url || abs;
        html = await r2.text();
      }
    } catch {}
  }
  const loadMs = Date.now() - t0;
  const $ = cheerio.load(html);
  const base = new URL(finalUrl);
  const origin = base.origin;

  const title = ($("title").first().text() || "").trim().slice(0, 200);
  const description = ($('meta[name="description"]').attr("content") || "").slice(0, 300);
  const canonical = ($('link[rel="canonical"]').attr("href") || "").slice(0, 300);
  const linkCount = $("a").length;

  // ---- 1. LOGO ----
  const logoSelectors = [
    "header img",
    "header a img",
    'a > img[class*="logo" i]',
    'img[class*="logo" i]',
    '[class*="logo" i] img',
    'svg[aria-label*="logo" i]',
    '[aria-label*="logo" i]',
    "a.brand img",
    ".navbar-brand img",
  ];
  let logoEl: cheerio.Cheerio<any> | null = null;
  let logoSelector = "";
  // Cheerio tidak support :i penuh di semua versi → fallback manual
  outer: for (const sel of logoSelectors) {
    try {
      const cand = $(sel.replace(/ i\]/g, "]")).first();
      if (cand && cand.length) {
        logoEl = cand;
        logoSelector = sel;
        break outer;
      }
    } catch {}
  }
  // fallback: img yang src/alt/class mengandung "logo"
  if (!logoEl || !logoEl.length) {
    const imgs = $("img").toArray();
    for (const el of imgs) {
      const a = $(el);
      const blob = `${a.attr("src") || ""} ${a.attr("alt") || ""} ${a.attr("class") || ""}`.toLowerCase();
      if (blob.includes("logo")) {
        logoEl = a;
        logoSelector = "img[src*='logo' i] (fuzzy fallback)";
        break;
      }
    }
  }
  let logoPass = false;
  let logoBukti = "Logo tidak ditemukan";
  let logoSrcAbs = "";
  let logoHref: string | null = null;
  if (logoEl && logoEl.length) {
    const tag = (logoEl.get(0) as any)?.tagName || "img";
    // Dukung lazy-load: data-src / data-lazy-src / srcset (false-negatif umum di tema modern)
    const srcset = logoEl.attr("srcset") || "";
    const srcsetFirst = (srcset.split(",")[0] || "").trim().split(/\s+/)[0] || "";
    const src = logoEl.attr("src") || logoEl.attr("data-src") || logoEl.attr("data-lazy-src") || logoEl.attr("data-original") || srcsetFirst || "";
    const alt = logoEl.attr("alt") || logoEl.attr("aria-label") || "";
    const style = (logoEl.attr("style") || "").toLowerCase();
    const hidden = style.includes("display:none") || style.includes("visibility:hidden");
    const w = parseInt(logoEl.attr("width") || "0", 10);
    const h = parseInt(logoEl.attr("height") || "0", 10);
    const tooSmallAttr = (w > 0 && w <= 16) || (h > 0 && h <= 16);
    try {
      logoSrcAbs = src ? new URL(src, finalUrl).toString() : "";
    } catch {
      logoSrcAbs = src;
    }
    let srcOk = tag === "svg"; // inline svg dianggap ok tanpa fetch
    if (src && tag === "img") {
      try {
        const r = await fetchWithTimeout(logoSrcAbs, 10000);
        srcOk = r.ok;
      } catch {
        srcOk = false;
      }
    }
    // parent <a> untuk cek #8
    const parentA = logoEl.closest("a");
    logoHref = parentA?.attr("href") || null;
    const altOk = alt.trim().length > 0;
    logoPass = !hidden && !tooSmallAttr && altOk && (srcOk || tag === "svg");
    logoBukti = `${tag} selector="${logoSelector}" src="${logoSrcAbs || src || "(inline svg)"}" alt="${alt}" hidden=${hidden} srcOk=${srcOk}`;
    if (!altOk) logoBukti += " | FAIL: alt kosong";
    if (hidden) logoBukti += " | FAIL: hidden";
    if (tooSmallAttr) logoBukti += " | FAIL: width/height ≤16px";
    if (!srcOk) logoBukti += " | FAIL: src tidak 200 OK";
  }

  // ---- 2. FAVICON ----
  let favHref =
    $('link[rel*="icon"]').first().attr("href") ||
    $('link[rel*="Icon"]').first().attr("href") ||
    "";
  let favPass = false;
  let favBukti = "";
  const candidates = favHref ? [favHref] : [];
  candidates.push("/favicon.ico"); // fallback wajib
  let favChecked = "";
  for (const c of candidates) {
    try {
      const abs = new URL(c, finalUrl).toString();
      favChecked = abs;
      const r = await fetchWithTimeout(abs, 10000);
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      const okType = ct.includes("image") || abs.endsWith(".ico") || ct.includes("icon");
      if (r.ok && (okType || r.ok)) {
        // terima 200 dengan content-type image/* atau .ico; toleran jika server tanpa content-type tapi 200 + path icon
        favPass = r.ok && (okType || c.includes("favicon"));
        if (r.ok && !favPass && c === "/favicon.ico") favPass = true; // fallback longgar tapi tetap 200
        favBukti = `href="${c}" abs="${abs}" HTTP ${r.status} content-type="${ct}"`;
        favHref = abs;
        break;
      }
      favBukti = `href="${c}" abs="${abs}" HTTP ${r.status}`;
    } catch (e: any) {
      favBukti = `href="${c}" error=${e?.message || e}`;
    }
  }
  if (!favPass && !favBukti) favBukti = "tidak ada link[rel*=icon] dan /favicon.ico 404";

  // ---- 3-7. FOOTER PAGES ----
  const anchors = $("a").toArray().map((el) => {
    const a = $(el);
    return {
      text: (a.text() || "").trim(),
      href: (a.attr("href") || "").trim(),
      html: `${(a.text() || "").trim()}|${a.attr("href") || ""}`,
    };
  });

  // Validasi isi halaman: 200 + cukup panjang + bukan soft-404 (dipakai jalur DOM & sitemap)
  async function validatePage(abs: string, shownText: string, via: string): Promise<{ ok: boolean; bukti: string; foundUrl: string }> {
    try {
      const r = await fetchWithTimeout(abs, 12000);
      const body = r.ok ? await r.text() : "";
      if (!r.ok) return { ok: false, bukti: `"${shownText}" → ${abs} HTTP ${r.status}${via}`, foundUrl: abs };
      if (isSoft404(body)) return { ok: false, bukti: `"${shownText}" → ${abs} HTTP 200 tapi konten <500 char / soft-404 (${body.length} chars)${via}`, foundUrl: abs };
      return { ok: true, bukti: `"${shownText}" → ${abs} HTTP 200, ${body.length} chars${via}`, foundUrl: abs };
    } catch (e: any) {
      return { ok: false, bukti: `"${shownText}" → ${abs} fetch error: ${e?.message || e}${via}`, foundUrl: abs };
    }
  }

  // Fallback: cari URL halaman di sitemap.xml bila link tidak ketemu di DOM
  // (kurangi false-negatif untuk redaksi link tak biasa). Cache berupa promise
  // agar aman dipanggil konkuren via Promise.all.
  let sitemapPromise: Promise<string[]> | null = null;
  function loadSitemap(): Promise<string[]> {
    if (!sitemapPromise) {
      sitemapPromise = (async () => {
        const found: string[] = [];
        try {
          const r = await fetchWithTimeout(origin + "/sitemap.xml", 8000);
          if (!r.ok) return found;
          const xml = (await r.text()).slice(0, 300_000);
          const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi)).map((m) => m[1].trim()).filter(Boolean);
          const childMaps = locs.filter((u) => u.toLowerCase().endsWith(".xml")).slice(0, 2);
          const pageUrls = locs.filter((u) => !u.toLowerCase().endsWith(".xml"));
          for (const cm of childMaps) {
            try {
              const rc = await fetchWithTimeout(cm, 8000);
              if (!rc.ok) continue;
              const xc = (await rc.text()).slice(0, 300_000);
              for (const m of Array.from(xc.matchAll(/<loc>([^<]+)<\/loc>/gi))) {
                const u = m[1].trim();
                if (u && !u.toLowerCase().endsWith(".xml")) pageUrls.push(u);
                if (pageUrls.length > 2000) break;
              }
            } catch {}
          }
          return Array.from(new Set(pageUrls)).slice(0, 2000);
        } catch {
          return found;
        }
      })();
    }
    return sitemapPromise;
  }

  async function checkPage(key: string, label: string, no: number): Promise<CheckItem> {
    const rx = LINK_PATTERNS[key];
    const match = anchors.find(
      (a) => rx.test(a.text) || rx.test(a.href)
    );
    if (match && match.href && !match.href.startsWith("#") && !match.href.startsWith("javascript")) {
      let abs = "";
      try {
        abs = new URL(match.href, finalUrl).toString();
      } catch {
        return { no, key, kriteria: label, status: "FAIL", bukti: `href relatif tidak bisa di-resolve: ${match.href}`, perbaikan: FIX_SNIPPETS[key].perbaikan, snippet: FIX_SNIPPETS[key].snippet, foundUrl: null };
      }
      const v = await validatePage(abs, match.text, "");
      if (v.ok) {
        return { no, key, kriteria: label, status: "PASS", bukti: v.bukti, perbaikan: "-", foundUrl: v.foundUrl };
      }
      const dead = v.bukti.includes("HTTP") && !v.bukti.includes("200");
      return { no, key, kriteria: label, status: "FAIL", bukti: v.bukti, perbaikan: `${FIX_SNIPPETS[key].perbaikan}${dead ? " Link ada tapi mati." : " Halaman terdeteksi soft-404."}`, snippet: FIX_SNIPPETS[key].snippet, foundUrl: v.foundUrl };
    }
    // Jalur 2: tidak ada link valid di DOM → intip sitemap.xml
    const domNote = match ? `teks="${match.text}" href="${match.href}" tapi href tidak valid. ` : "Link tidak ditemukan (fuzzy match gagal). ";
    const locs = await loadSitemap();
    const hit = locs.find((u) => rx.test(u));
    if (hit) {
      let abs = hit;
      try { abs = new URL(hit, finalUrl).toString(); } catch {}
      const v = await validatePage(abs, label + " (via sitemap)", " [sitemap]");
      if (v.ok) {
        return { no, key, kriteria: label, status: "PASS", bukti: v.bukti, perbaikan: "-", foundUrl: v.foundUrl };
      }
      return { no, key, kriteria: label, status: "FAIL", bukti: domNote + v.bukti, perbaikan: `${FIX_SNIPPETS[key].perbaikan} URL sitemap bermasalah.`, snippet: FIX_SNIPPETS[key].snippet, foundUrl: v.foundUrl };
    }
    return {
      no, key, kriteria: label, status: "FAIL",
      bukti: domNote + "Sitemap juga tidak memuat URL cocok.",
      perbaikan: FIX_SNIPPETS[key].perbaikan, snippet: FIX_SNIPPETS[key].snippet, foundUrl: null,
    };
  }

  const pageChecks = await Promise.all([
    checkPage("about", "Halaman/link About Us", 3),
    checkPage("dmca", "Halaman/link DMCA", 4),
    checkPage("contact", "Halaman/link Contact Us", 5),
    checkPage("tos", "Halaman/link Terms of Service (ToS)", 6),
    checkPage("privacy", "Halaman/link Privacy Policy", 7),
  ]);

  // ---- 8. LOGO → HOME ----
  let homePass = false;
  let homeBukti = "Tidak ada parent <a> pada logo";
  if (logoHref) {
    try {
      const absHome = new URL(logoHref, finalUrl).toString();
      const homeUrl = new URL(absHome);
      const isRoot =
        homeUrl.pathname === "/" ||
        homeUrl.pathname === "" ||
        homeUrl.href === origin + "/" ||
        absHome === finalUrl ||
        absHome === origin ||
        absHome === origin + "/";
      if (isRoot || homeUrl.origin === base.origin) {
        const r = await fetchWithTimeout(absHome, 10000);
        homePass = r.ok;
        homeBukti = `logo href="${logoHref}" → ${absHome} HTTP ${r.status} isRoot=${isRoot}`;
        if (!r.ok) homeBukti += " | FAIL: navigasi tidak 200";
        else if (!isRoot) homeBukti += " | catatan: href bukan root tapi masih satu origin & 200 (diterima longgar)";
        if (!isRoot && r.ok) homePass = true;
      } else {
        homeBukti = `logo href="${logoHref}" → ${absHome} beda origin, FAIL`;
      }
    } catch (e: any) {
      homeBukti = `logo href="${logoHref}" error: ${e?.message || e}`;
    }
  }

  // ---- 9. MOBILE RESPONSIVE (info, tidak memengaruhi skor 8 cek) ----
  const viewportContent = ($('meta[name="viewport"]').attr("content") || "").trim();
  const viewportOk = /width\s*=\s*device-width/i.test(viewportContent);
  // hitung @media di <style> inline
  let inlineCss = "";
  $("style").each((_, el) => {
    inlineCss += $(el).html() || "";
  });
  const mediaRx = /@media[^{]*\((max|min)-width/gi;
  const inlineMediaCount = (inlineCss.match(mediaRx) || []).length;
  // fetch max 3 stylesheet same-origin, scan @media (budget waktu dijaga)
  const cssHrefs = $('link[rel="stylesheet"]')
    .toArray()
    .map((el) => $(el).attr("href") || "")
    .filter((h) => h && !h.startsWith("data:"))
    .slice(0, 3);
  let cssMediaCount = 0;
  const cssMediaSources: string[] = [];
  if (inlineMediaCount > 0) cssMediaSources.push("inline <style>");
  await Promise.all(
    cssHrefs.map(async (h) => {
      try {
        const abs = new URL(h, finalUrl).toString();
        const r = await fetchWithTimeout(abs, 8000);
        if (!r.ok) return;
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (ct && !ct.includes("css") && !ct.includes("text")) return;
        const txt = (await r.text()).slice(0, 200_000);
        const n = (txt.match(mediaRx) || []).length;
        if (n > 0) {
          cssMediaCount += n;
          cssMediaSources.push(`${abs} (${n} @media)`);
        }
      } catch {}
    })
  );
  const mediaTotal = inlineMediaCount + cssMediaCount;
  // framework / teknik responsif dari class + css
  const bodyClasses = ($("html").attr("class") || "") + " " + ($("body").attr("class") || "");
  const allHtml = html.slice(0, 300_000);
  const frameworkHints: string[] = [];
  if (/(sm:|md:|lg:|xl:|container mx-auto|grid-cols-|flex-col md:flex-row)/.test(allHtml)) frameworkHints.push("Tailwind responsive (sm:/md:/lg:)");
  if (/(col-(xs|sm|md|lg)-|navbar-toggler|container-fluid|d-(none|block|flex))/.test(allHtml)) frameworkHints.push("Bootstrap responsif");
  if (/max-width\s*:\s*100%/.test(inlineCss) || /max-width\s*:\s*100%/.test(allHtml.slice(0, 50000))) frameworkHints.push("img/fluid max-width:100%");
  if (/(display\s*:\s*flex|display\s*:\s*grid)/.test(inlineCss)) frameworkHints.push("flex/grid layout");
  // red flags: lebar fix besar inline
  const redFlags: string[] = [];
  const fixedWidths = html.match(/width\s*:\s*(\d{3,4})px/gi) || [];
  const bigFixed = fixedWidths.filter((w) => parseInt(w.replace(/\D/g, ""), 10) >= 768);
  if (bigFixed.length > 0) redFlags.push(`${bigFixed.length} lebar fix ≥768px (mis. ${bigFixed[0]})`);
  if (!viewportOk) redFlags.push("tanpa meta viewport device-width");
  if (mediaTotal === 0 && frameworkHints.length === 0) redFlags.push("tidak ada @media query / pola responsif terdeteksi");
  const mobilePass = viewportOk && (mediaTotal > 0 || frameworkHints.length > 0);
  const mobileBukti =
    `viewport=${viewportOk ? `"${viewportContent}"` : "(tidak ada/tidak valid)"} | ` +
    `@media=${mediaTotal} (inline:${inlineMediaCount} css:${cssMediaCount}) | ` +
    `framework=[${frameworkHints.join("; ") || "-"}] | ` +
    `redflags=[${redFlags.join("; ") || "-"}]`;
  const mobile: MobileCheck = {
    status: mobilePass ? "PASS" : "FAIL",
    viewport: viewportOk,
    viewportContent,
    mediaQueries: mediaTotal,
    mediaSources: cssMediaSources,
    frameworkHints,
    redFlags,
    bukti: mobileBukti,
    perbaikan: mobilePass ? "-" : FIX_SNIPPETS.mobile.perbaikan,
    snippet: mobilePass ? undefined : FIX_SNIPPETS.mobile.snippet,
  };

  const checks: CheckItem[] = [
    {
      no: 1, key: "logo", kriteria: "Logo terlihat (alt tidak kosong, >16px)",
      status: logoPass ? "PASS" : "FAIL", bukti: logoBukti,
      perbaikan: logoPass ? "-" : FIX_SNIPPETS.logo.perbaikan,
      snippet: logoPass ? undefined : FIX_SNIPPETS.logo.snippet,
      foundUrl: logoSrcAbs || null,
    },
    {
      no: 2, key: "favicon", kriteria: "Favicon dapat diakses (HTTP 200)",
      status: favPass ? "PASS" : "FAIL", bukti: favBukti,
      perbaikan: favPass ? "-" : FIX_SNIPPETS.favicon.perbaikan,
      snippet: favPass ? undefined : FIX_SNIPPETS.favicon.snippet,
      foundUrl: favHref || null,
    },
    ...pageChecks,
    {
      no: 8, key: "logohome", kriteria: "Logo diklik kembali ke Home",
      status: homePass ? "PASS" : "FAIL", bukti: homeBukti,
      perbaikan: homePass ? "-" : FIX_SNIPPETS.logohome.perbaikan,
      snippet: homePass ? undefined : FIX_SNIPPETS.logohome.snippet,
      foundUrl: logoHref ? new URL(logoHref, finalUrl).toString() : null,
    },
    {
      no: 9, key: "mobile", kriteria: "Mobile-responsive",
      status: mobile.status, bukti: mobile.bukti,
      perbaikan: mobilePass ? "-" : FIX_SNIPPETS.mobile.perbaikan,
      snippet: mobilePass ? undefined : FIX_SNIPPETS.mobile.snippet,
      foundUrl: null,
    },
  ];

  const passed = checks.filter((c) => c.status === "PASS").length;
  const score = Math.round((passed * 100) / 9); // 9 cek gabung, @~11,11%
  return {
    target, finalUrl,
    score, status: score === 100 ? "PASS" : "FAIL",
    checks,
    mobile,
    meta: { title, description, canonical, loadMs, htmlBytes: html.length, linkCount },
  };
}
