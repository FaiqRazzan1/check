---
title: Website Compliance Checker — Laporan
date: 2026-09-28
tags:
  - project
  - compliance-checker
  - nextjs
aliases:
  - Compliance Checker Report
---

# Website Compliance Checker

> [!success] Build lolos
> `npm run build` sukses. Fixture lokal → `67% FAIL` (logo lazy PASS, about+privacy PASS via sitemap, dmca/tos FAIL benar). `example.com` tetap `0% FAIL` (regresi aman).

## Deploy Online (fokus)

> [!tip] Yang tayang = versi Next.js (Vercel/Netlify)
> - `https://check-livid-three.vercel.app` dan `https://webchec.netlify.app` — API `/api/check` terverifikasi hidup, hasil identik dengan lokal.
> - Fitur Chromium (🎯/📸) otomatis disembunyikan di hosting serverless, muncul hanya di `localhost` atau bila `NEXT_PUBLIC_BROWSER_ENABLED=true` (Docker/VPS).
> - Setelah update ini: **redeploy dari kode terbaru** (push Git → auto-deploy, atau upload/CLI ulang).

> [!warning] Batas jujur akurasi online
> Tanpa browser, yang tidak bisa dipastikan: konten JS-rendered (SPA), situs di balik Cloudflare/CAPTCHA/login, dan halaman yang butuh interaksi. Bila kena itu, API mengembalikan error eksplisit + hint — bukan skor ngawur. Browser penuh online hanya lewat Docker/VPS (`Dockerfile` siap di repo).

## Ringkasan
Lihat [[#Cara Kerja]] dan tabel [[#Simulasi]] di bawah. Kode sumber ada di `package.json`, `lib/checker.ts`, `app/api/check/route.ts`, `app/page.tsx`, `checker-standalone.html`.

## Cara Kerja
Input URL → normalisasi → fetch HTML (retry 1x) → ikuti meta-refresh → parse Cheerio → 9 cek biner gabung (8 wajib + 📱 mobile) → skor `lolos×100/9` → dashboard PASS/FAIL + saran tempel.
📱 Mobile: viewport `device-width` + scan `@media (max/min-width)` di `<style>` inline + max 3 stylesheet + hint Tailwind/Bootstrap + red-flag lebar fix ≥768px. Tes visual Playwright (Chromium 360×640) tetap tersedia sebagai pembuktian render beneran.

## Akurasi Maksimal (mesin statis, aman serverless)
- [x] Retry 1x untuk timeout/abort transient (kurangi false-FAIL)
- [x] Ikuti `<meta http-equiv="refresh">` 1 hop
- [x] Logo lazy-load: `data-src` / `data-lazy-src` / `data-original` / `srcset`
- [x] Fallback `sitemap.xml` (+ maks 2 child-sitemap) bila link tak ketemu di DOM — bukti ditandai `[sitemap]`
- [x] Tolak href fragment (`#...`), `javascript:`, kosong — konsisten dengan screenshot audit `godsseo.net` (89% yang jujur)

## Simulasi
| URL | Skor | Status | Mobile statis | Visual HP 360 (Playwright) |
|-----|------|--------|---------------|----------------------------|
| https://example.com (statis) | 0% | FAIL | ❌ BELUM (viewport ada, 0 @media) | ✅ tidak meluber, 0px |
| https://example.com (🎯 browser) | 11% | FAIL | — | ✅ PASS render beneran |
| Situs lengkap (logo+favicon+5 footer+logo→home) | 100% | PASS | ✅ YA bila viewport + @media ada | ✅ bila tidak ada overflow |

> [!warning] Edge-case
> SPA/Cloudflare/CORS-block butuh Playwright fallback. Single-file hanya audit parsial.

## Checklist
- [x] Logo
- [x] Favicon
- [x] About
- [x] DMCA
- [x] Contact
- [x] ToS
- [x] Privacy
- [x] Logo → Home
- [x] 📱 Mobile-responsive (viewport + @media + framework hint + red-flag)
- [x] 📸 Visual HP Playwright (`POST /api/check-mobile`, Chromium 360×640, ukur overflow + screenshot)
- [x] 🎯 Mode akurat (`POST /api/check {"engine":"browser"}`, 9 cek di DOM render: visibilitas beneran, navigasi halaman, klik logo)
