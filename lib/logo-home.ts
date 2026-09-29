// Shared helper: apakah sebuah URL berarti "Home".
// Dipakai mesin statis (checker.ts) + browser (audit-playwright.ts)
// + varian single-file (duplikasi logika di index.html / checker-standalone.html).
// Jaga sinkron bila diubah di sini.

const HOME_PATHS = new Set([
  "/",
  "",
  "/index.html",
  "/index.htm",
  "/index.php",
  "/home",
  "/beranda",
  "/homepage",
  "/main",
  "/welcome",
  "/default.aspx",
  "/default",
  // akar bahasa umum (situs multi-bahasa redirect / -> /id, /en, dst)
  "/id",
  "/en",
  "/ms",
  "/de",
  "/fr",
  "/es",
  "/pt",
  "/nl",
  "/it",
  "/ja",
  "/zh",
  "/ko",
  "/ar",
  "/hi",
  "/th",
  "/vi",
]);

export function normalizeHost(host: string): string {
  return (host || "").trim().toLowerCase().replace(/^www\./, "");
}

export function normalizePath(pathname: string): string {
  let p = (pathname || "/").trim();
  if (!p.startsWith("/")) p = "/" + p;
  try {
    p = decodeURIComponent(p);
  } catch {}
  p = p.toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

function pathIsHome(pathname: string): boolean {
  const p = normalizePath(pathname);
  if (HOME_PATHS.has(p)) return true;
  // "/id/" "/en/home" "beranda/" dkk → segmen pertama/terakhir bermakna home
  const segs = p.split("/").filter(Boolean);
  if (segs.length === 1 && HOME_PATHS.has("/" + segs[0])) return true;
  if (segs.length === 2 && HOME_PATHS.has("/" + segs[0]) && HOME_PATHS.has("/" + segs[1])) return true;
  return false;
}

export function sameSite(a: URL, b: URL): boolean {
  if (a.protocol !== b.protocol) {
    // toleransi http<->https (upgrade/downgrade umum), tolak scheme lain
    const ok = (a.protocol === "http:" || a.protocol === "https:") && (b.protocol === "http:" || b.protocol === "https:");
    if (!ok) return false;
  }
  if (normalizeHost(a.hostname) !== normalizeHost(b.hostname)) return false;
  const def = (u: URL) => u.port || (u.protocol === "https:" ? "443" : u.protocol === "http:" ? "80" : u.port);
  const pa = def(a);
  const pb = def(b);
  if (pa === pb) return true;
  // http:80 ↔ https:443 dianggap situs sama (upgrade/downgrade umum)
  const httpPair =
    (a.protocol === "http:" && b.protocol === "https:") || (a.protocol === "https:" && b.protocol === "http:");
  const defPair = (pa === "80" && pb === "443") || (pa === "443" && pb === "80");
  return httpPair && defPair;
}

/** href mentah (relatif/absolut/""/"#"/javascript:) → URL absolut atau null bila tak-navigasional. */
export function resolveLogoHref(rawHref: string | null | undefined, base: string): URL | null {
  const h = (rawHref || "").trim();
  if (!h) return null; // "" = reload halaman aktif, bukan bukti ke-home → tangani via klik/DOM
  if (/^javascript:/i.test(h)) return null;
  if (h.startsWith("#")) return null; // fragment saja tidak navigasi ke home
  try {
    return new URL(h, base);
  } catch {
    return null;
  }
}

/**
 * Keputusan utama: apakah `candidate` (tempat logo mengarah/mendarat)
 * adalah homepage dari `home` (finalUrl halaman yang diaudit)?
 * Query (?lang=id, ?ref=logo) & hash (#home) diabaikan — path+site yang menentukan.
 */
export function isHomeUrl(candidate: string, home: string): boolean {
  let c: URL;
  let h: URL;
  try {
    c = new URL(candidate);
    h = new URL(home);
  } catch {
    return false;
  }
  if (!sameSite(c, h)) return false;
  if (pathIsHome(c.pathname)) return true;
  // halaman aktif itu sendiri (mis. logo href menunjuk URL halaman saat ini level-root)
  if (normalizePath(c.pathname) === normalizePath(h.pathname)) return true;
  return false;
}
