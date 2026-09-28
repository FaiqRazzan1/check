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
> `npm run build` sukses. `example.com` → statis `0% FAIL`, browser `11% FAIL` (mobile PASS: render 360px tidak meluber). Mesin browser memberi bukti `[browser]` per cek.

## Ringkasan
Lihat [[#Cara Kerja]] dan tabel [[#Simulasi]] di bawah. Kode sumber ada di `package.json`, `lib/checker.ts`, `app/api/check/route.ts`, `app/page.tsx`, `checker-standalone.html`.

## Cara Kerja
Input URL → normalisasi → fetch HTML → parse Cheerio → 9 cek biner gabung (8 wajib + 📱 mobile) → skor `lolos×100/9` → dashboard PASS/FAIL + saran tempel.
📱 Mobile: viewport `device-width` + scan `@media (max/min-width)` di `<style>` inline + max 3 stylesheet + hint Tailwind/Bootstrap + red-flag lebar fix ≥768px. Tes visual Playwright (Chromium 360×640) tetap tersedia sebagai pembuktian render beneran.

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
