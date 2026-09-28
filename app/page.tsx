"use client";
import { useState } from "react";
import type { CheckResponse } from "@/lib/checker";
import type { VisualMobileResult } from "@/lib/mobile-playwright";

const STEPS = [
  "Mengambil HTML...",
  "Mengecek logo...",
  "Mengecek favicon...",
  "Mengecek 5 halaman footer...",
  "Mengetes klik logo → home...",
  "Mengecek mobile-responsive...",
  "Menghitung skor...",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<CheckResponse | null>(null);
  const [error, setError] = useState("");
  const [visual, setVisual] = useState<VisualMobileResult | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualError, setVisualError] = useState("");
  const [accurate, setAccurate] = useState(false);

  async function cek() {
    setError("");
    setData(null);
    let v = url.trim();
    if (!v) {
      setError("Isi dulu URL-nya, mis. https://contoh.com");
      return;
    }
    setLoading(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1200);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v, engine: accurate ? "browser" : "static" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal cek");
      setData(json);
    } catch (e: any) {
      setError(e?.message || "Gagal");
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }

  function copyReport() {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    alert("Laporan JSON disalin!");
  }

  async function tesVisual() {
    const v = (data?.finalUrl || url).trim();
    if (!v) {
      setVisualError("Isi dulu URL-nya.");
      return;
    }
    setVisualError("");
    setVisual(null);
    setVisualLoading(true);
    try {
      const res = await fetch("/api/check-mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: v, width: 360, height: 640 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Tes visual gagal");
      setVisual(json);
    } catch (e: any) {
      setVisualError(e?.message || "Gagal");
    } finally {
      setVisualLoading(false);
    }
  }

  const fails = data?.checks.filter((c) => c.status === "FAIL") || [];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:p-6">
      <h1 className="text-2xl font-bold sm:text-3xl">🛡️ Website Compliance Checker</h1>
      <p className="mt-1 text-slate-400">
        9 kriteria • ~11,1% per cek • 100% = <b className="text-green-400">PASS</b>, &lt;100% = <b className="text-red-400">FAIL</b> (termasuk 📱 mobile)
      </p>

      <div className="no-print mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && cek()}
          placeholder="https://tokosaya.com"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 outline-none focus:border-emerald-500"
        />
        <button
          onClick={cek}
          disabled={loading}
          className="rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? "Mengecek..." : "Cek Sekarang"}
        </button>
      </div>
      <div className="no-print mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <span>Contoh:{" "}
        <button className="underline" onClick={() => setUrl("https://example.com")}>https://example.com</button>
        {" • "}
        <button className="underline" onClick={() => setUrl("https://wikipedia.org")}>https://wikipedia.org</button></span>
        <label className="flex cursor-pointer items-center gap-1 text-xs text-sky-300">
          <input type="checkbox" checked={accurate} onChange={(e) => setAccurate(e.target.checked)} />
          🎯 Mode akurat — render browser beneran (~15–60 dtk, atasi SPA/JS)
        </label>
      </div>

      {loading && <p className="mt-4 animate-pulse text-amber-300">⏳ {STEPS[step]}</p>}
      {error && <p className="mt-4 rounded-lg bg-red-950 p-3 text-red-300">❌ {error}</p>}

      {data && (
        <>
          <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:gap-6 sm:p-6">
            <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-8 text-2xl font-bold sm:h-28 sm:w-28 sm:text-3xl ${data.status === "PASS" ? "border-green-500 text-green-400" : "border-red-500 text-red-400"}`}>
              {data.score}%
            </div>
            <div className="w-full text-center sm:w-auto sm:text-left">
              <span className={`rounded-full px-4 py-1 text-sm font-bold ${data.status === "PASS" ? "bg-green-500 text-slate-950" : "bg-red-500 text-white"}`}>
                {data.status}
              </span>
              <p className="mt-2 break-all text-sm text-slate-400">{data.finalUrl}</p>
              <p className="text-xs text-slate-500">
                {data.meta.loadMs} ms • {data.meta.htmlBytes} bytes • {data.meta.linkCount} links • {data.meta.title || "(tanpa title)"}
              </p>
              <div className="no-print mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
                <button onClick={copyReport} className="rounded bg-slate-700 px-3 py-1 text-xs">Copy JSON</button>
                <button onClick={() => window.print()} className="rounded bg-slate-700 px-3 py-1 text-xs">PDF / Print</button>
              </div>
            </div>
          </div>

          <h2 className="mb-2 mt-6 font-semibold">Tabel Hasil</h2>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full min-w-[560px] text-xs sm:text-sm">
              <thead className="bg-slate-900">
                <tr><th className="p-1.5 text-left sm:p-2">No</th><th className="p-1.5 text-left sm:p-2">Kriteria</th><th className="p-1.5 sm:p-2">Status</th><th className="p-1.5 text-left sm:p-2">Bukti</th><th className="p-1.5 text-left sm:p-2">Aksi</th></tr>
              </thead>
              <tbody>
                {data.checks.map((c) => (
                  <tr key={c.no} className="border-t border-slate-800">
                    <td className="p-1.5 sm:p-2">{c.no}</td>
                    <td className="p-1.5 sm:p-2">{c.kriteria}</td>
                    <td className="p-1.5 text-center sm:p-2">{c.status === "PASS" ? "✅ PASS" : "❌ FAIL"}</td>
                    <td className="max-w-[280px] break-words p-1.5 text-xs text-slate-400 sm:p-2">{c.bukti}</td>
                    <td className="max-w-[220px] break-words p-1.5 text-xs sm:p-2">{c.perbaikan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {fails.length > 0 && (
            <div className="mt-6 rounded-2xl border border-red-800 bg-red-950/40 p-5">
              <h2 className="font-bold text-red-300">🔧 Yang Harus Diperbaiki ({fails.length})</h2>
              {fails.map((f) => (
                <div key={f.no} className="mt-3 rounded-lg bg-slate-950 p-3">
                  <p className="text-sm"><b>#{f.no} {f.kriteria}</b> — {f.perbaikan}</p>
                  <p className="mt-1 text-xs text-slate-400">Kenapa penting: memengaruhi kepercayaan user, SEO, dan kelolosan audit 100%.</p>
                  {f.snippet && <pre className="mt-2 overflow-x-auto rounded bg-black p-2 text-xs text-green-300">{f.snippet}</pre>}
                  <p className="mt-1 text-xs text-slate-500">Lokasi: header/footer template (Next.js: app/layout.tsx • HTML biasa: index.html).</p>
                </div>
              ))}
            </div>
          )}

          {data.mobile && (
            <div className={`mt-6 rounded-2xl border p-5 ${data.mobile.status === "PASS" ? "border-emerald-800 bg-emerald-950/30" : "border-amber-800 bg-amber-950/30"}`}>
              <h2 className="font-bold">
                📱 Mobile-Responsive: {data.mobile.status === "PASS" ? "✅ YA" : "❌ BELUM"}
              </h2>
              <p className="mt-1 break-words text-xs text-slate-400">{data.mobile.bukti}</p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                <div className="rounded bg-slate-950 p-2">
                  <b>Viewport</b><br />{data.mobile.viewport ? `✔ ${data.mobile.viewportContent}` : "✘ tidak ada device-width"}
                </div>
                <div className="rounded bg-slate-950 p-2">
                  <b>@media queries</b><br />{data.mobile.mediaQueries} ({data.mobile.mediaSources.join(", ") || "tidak ada"})
                </div>
                <div className="rounded bg-slate-950 p-2">
                  <b>Framework / pola</b><br />{data.mobile.frameworkHints.join(", ") || "—"}
                </div>
              </div>
              {data.mobile.redFlags.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-300">
                  {data.mobile.redFlags.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
              {data.mobile.status === "FAIL" && (
                <div className="mt-3 rounded-lg bg-slate-950 p-3">
                  <p className="text-xs text-slate-500">Perbaikan untuk cek ini ada di panel <b>🔧 Yang Harus Diperbaiki</b> di atas (cek #9).</p>
                  <div className="no-print mt-2">
                    <button
                      onClick={tesVisual}
                      disabled={visualLoading}
                      className="rounded bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      {visualLoading ? "⏳ Merender HP 360×640..." : "📸 Tes visual HP beneran (Playwright 360×640)"}
                    </button>
                  </div>
                </div>
              )}
              {data.mobile.status === "PASS" && (
                <div className="no-print mt-3">
                  <button
                    onClick={tesVisual}
                    disabled={visualLoading}
                    className="rounded bg-slate-700 px-3 py-1.5 text-xs hover:bg-slate-600 disabled:opacity-50"
                  >
                    {visualLoading ? "⏳ Merender HP 360×640..." : "📸 Verifikasi visual HP (Playwright 360×640)"}
                  </button>
                </div>
              )}
            </div>
          )}

          {visualError && <p className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">❌ Visual: {visualError}</p>}

          {visual && (
            <div className="mt-6 rounded-2xl border border-sky-800 bg-sky-950/20 p-5">
              <h2 className="font-bold">
                📸 Hasil Visual HP {visual.viewport.width}×{visual.viewport.height}:{" "}
                {visual.status === "PASS" ? "✅ TIDAK MELUBER" : `❌ MELUBER ${visual.overflowPx}px`}
              </h2>
              <p className="mt-1 break-words text-xs text-slate-400">{visual.bukti}</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                {visual.screenshot && (
                  <img
                    src={`data:image/png;base64,${visual.screenshot}`}
                    alt="Screenshot mobile 360px"
                    className="w-[180px] self-start rounded-lg border border-slate-700"
                  />
                )}
                <div className="text-xs">
                  <p><b>Final URL:</b> <span className="break-all text-slate-400">{visual.finalUrl}</span> ({visual.loadMs} ms)</p>
                  <p className="mt-1"><b>Elemen meluber:</b></p>
                  {visual.overflowingElements.length > 0 ? (
                    <ul className="list-disc pl-5 text-amber-300">
                      {visual.overflowingElements.map((el, i) => <li key={i}>{el}</li>)}
                    </ul>
                  ) : (
                    <p className="text-slate-400">— tidak ada —</p>
                  )}
                  <p className="mt-1"><b>Tap-target kecil (&lt;24px):</b> {visual.smallTapTargets} (disarankan ≥48×48px untuk jempol)</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 text-xs text-slate-500">
            <p><b>Meta:</b> title="{data.meta.title}" • description="{data.meta.description.slice(0, 120)}" • canonical="{data.meta.canonical}"</p>
            <p className="mt-1">SPA/JS-rendered, Cloudflare, atau CORS-block: gunakan Playwright fallback (render penuh) bila skor terlihat salah.</p>
          </div>
        </>
      )}
    </main>
  );
}
