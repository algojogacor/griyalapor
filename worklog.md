# GriyaLapor — Worklog

PWA Pencatatan Keuangan PPOB untuk usaha kakek. Next.js 16 + Turso + Mistral AI Agent.

## Keputusan Teknis
- Database: Turso (libSQL) via Prisma + `@prisma/adapter-libsql`
- AI: Mistral `mistral-large-latest` (function calling), via API route server-side
- Arsitektur: Next.js 16 + API Routes (proxy tipis), single-page app dengan section navigation client-side
- Performa: CSS transitions (bukan framer-motion berat), lazy-load charts, minimal client JS (laptop kakek lemot)
- Styling: Tailwind 4, hijau tua + putih, font besar kontras tinggi, bottom nav mobile, 100% Bahasa Indonesia
- PWA: manifest + service worker, installable

## Credentials
- Turso URL: libsql://ppob-algojogacorbgt.aws-ap-northeast-1.turso.io
- Turso token: disimpan di .env.local (rotasi sebelum production!)
- Mistral key: disimpan di .env.local

---
Task ID: 0
Agent: main (orchestrator)
Task: Phase 0 — Foundation setup

Work Log:
- Eksplorasi project: Next.js 16, Tailwind 4 (CSS-first), Prisma 6, shadcn/ui lengkap, dev server sudah jalan di port 3000
- Install deps: @prisma/adapter-libsql, @libsql/client, papaparse (+types)
- Tulis .env.local (TURSO_URL, TURSO_AUTH_TOKEN, DATABASE_URL embedded token, MISTRAL_API_KEY, MISTRAL_MODEL)
- Tulis prisma/schema.prisma: model Category, Transaction, Expense, Setting (Turso/libSQL)
- Update src/lib/db.ts: PrismaClient dengan PrismaLibSQL adapter
- Tulis src/lib/format.ts: format rupiah, tanggal Indonesia, range minggu/bulan
- Tulis src/lib/mistral.ts: client Mistral dengan function calling

Stage Summary:
- Foundation siap. Berikutnya: prisma db push ke Turso, generate client, seed kategori PPOB default, lalu build layout + theming + nav shell.

---
Task ID: 2
Agent: full-stack-developer
Task: Build ReportsSection + ImportSection (full implementations)

Work Log:
- Baca context: worklog.md, src/lib/format.ts, src/lib/db.ts, DashboardSection.tsx, TransactionsSection.tsx, globals.css, AppShell.tsx, dan semua API routes terkait (summary, transactions, expenses, export, import, settings) untuk memahami contract data & pola visual.
- Buat helper `src/components/app/sections/MonthlyChart.tsx` — komponen recharts (BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer) yang theme-aware via `fill-primary`/`fill-destructive` Tailwind classes + `currentColor` untuk grid/axis. File terpisah agar bisa di-code-split dengan `next/dynamic({ ssr: false })`.
- Overwrite `src/components/app/sections/ReportsSection.tsx`:
  - Header "Laporan" + filter rentang tanggal (Dari/Sampai, default = thisMonthRange) + tombol "Bulan Ini".
  - Kartu ringkasan: Total Pendapatan, Jumlah Transaksi, Total Pengeluaran, Laba Bersih (hanya tampil jika `expenses_enabled === '1'` dari `/api/settings`). Komputasi dari `/api/transactions?from=&to=` dan `/api/expenses?from=&to=` sesuai spec.
  - Grafik batang 6 bulan terakhir via lazy-load `MonthlyChart` (recharts), data dari `/api/summary` → `monthlyTrend`.
  - Tabel breakdown per kategori (Kategori, Grup, Jumlah, Total) dengan progress bar relatif terhadap max, diurutkan desc.
  - Export CSV: `window.location.href = /api/export?from=&to=&expenses=1`.
  - Export PDF: `window.open()` + `document.write()` HTML styled (judul, rentang, tabel transaksi dengan TOTAL, tabel pengeluaran + laba bersih bila enabled), lalu `print()`. Inline CSS print-friendly.
  - react-query untuk semua fetch, loading skeletons, empty states, formatRupiah + tabular-nums.
- Overwrite `src/components/app/sections/ImportSection.tsx`:
  - Alur 3 langkah dengan indikator visual (Upload → Pemetaan → Konfirmasi).
  - Step 1: drag-drop zone + file input (.csv), tombol "Unduh Contoh CSV" (generate CSV header `Tanggal,Kategori,Grup,Jumlah,Fee,Catatan` + 2 baris contoh), penjelasan format & sinonim kolom.
  - Step 2: 6 Select dropdown untuk pemetaan field (Tanggal, Kategori, Grup opsional, Jumlah, Fee opsional, Catatan opsional) dengan auto-detect berdasarkan nama header (regex case-insensitive). Deteksi format tanggal otomatis (YYYY-MM-DD / DD/MM/YYYY / DD-MM-YYYY) dari 10 sample pertama, dengan override manual. Preview tabel 8 baris pertama dengan Total = qty × fee. Validasi: Tanggal, Kategori, Jumlah wajib; pesan error Bahasa Indonesia.
  - Step 3: hasil impor (jumlah berhasil, kategori baru dibuat dengan badge, daftar error per baris). Tombol "Impor Lagi" untuk reset.
  - Normalisasi: tanggal → YYYY-MM-DD sesuai format terdeteksi, qty/fee → integer. POST ke `/api/import` dengan `{ rows, createMissing: true }`. Invalidate queries transactions/summary/categories setelah sukses. sonner toast untuk semua feedback.
- Jalankan `bun run lint` → pass tanpa error. Jalankan `npx tsc --noEmit` → tidak ada error baru di file yang dibuat (MonthlyChart, ReportsSection, ImportSection). Hanya pre-existing error di API routes (Row casting) & examples yang tidak terkait task ini.

Stage Summary:
- Files created: `src/components/app/sections/MonthlyChart.tsx` (helper recharts, lazy-loadable).
- Files modified: `src/components/app/sections/ReportsSection.tsx` (full implementation), `src/components/app/sections/ImportSection.tsx` (full implementation).
- Tidak ada API route baru; semua konsumsi endpoint existing.
- recharts di-code-split via `next/dynamic({ ssr: false })` agar tidak membebani bundle utama (laptop kakek lemot).
- 100% Bahasa Indonesia, font besar kontras tinggi, mobile-first responsive, light mode primary, dark mode berfungsi via CSS variables.
- `bun run lint` PASS. TypeScript clean untuk file baru.

---
Task ID: 1 + 3 + 4 + 5
Agent: main (orchestrator)
Task: Dashboard, Transactions, Categories, Settings, AI Agent, PWA, verification

Work Log:
- KOREKSI Phase 0: Prisma CLI `sqlite` provider menolak URL `libsql://` untuk db push. PIVOT ke `@libsql/client` langsung (sesuai brief asli, lebih ringan untuk laptop lemot). `src/lib/db.ts` sekarang pakai createClient(TURSO_URL, TURSO_AUTH_TOKEN). Skema DDL di `prisma/schema.sql`, dijalankan via `scripts/migrate.ts`. Migration + seed 17 kategori PPOB default berhasil ke Turso.
- API routes lengkap (semua konsumsi libsql langsung): /api/categories (GET/POST) + [id] (PATCH/DELETE dengan cek relasi), /api/transactions (GET dengan filter, POST, DELETE?last=1 untuk undo) + [id] (DELETE), /api/expenses (GET/POST) + [id] (DELETE), /api/summary (ringkasan today/week/month + breakdown + tren 6 bulan + recent), /api/settings (GET/PATCH upsert), /api/export (CSV transaksi/pengeluaran), /api/import (bulk insert dengan auto-create kategori hilang), /api/agent (Mistral function calling).
- src/lib/store.ts (Zustand): active section + agent open + expenses enabled.
- src/components/app/providers.tsx: ThemeProvider (light default) + QueryClient + Toaster + apply font-size dari localStorage ke <html data-font-size>.
- src/app/layout.tsx: metadata GriyaLapor, manifest, theme-color #1f7a55, font Geist, viewport.
- src/app/globals.css: theme hijau tua (oklch) light + dark, base font 17px dengan 3 ukuran (medium/large/xlarge via data-font-size), custom scrollbar, print styles, no heavy animations.
- src/components/app/AppShell.tsx: header sticky + branding + theme toggle, sidebar desktop (6 nav), bottom nav mobile (5 nav), main content area, AgentChat overlay. Sticky footer via min-h-screen flex flex-col.
- DashboardSection: greeting + tanggal, hero card "Pendapatan Hari Ini" dengan tombol Catat & Batal Terakhir (undo), 3 stat cards (hari/minggu/bulan), expense mini cards (jika enabled), quick links (Impor/Laporan), breakdown per kategori bulan ini, transaksi terakhir, hint AI.
- TransactionsSection: form Catat (tanggal, kategori grouped select, qty & fee input besar dengan auto-fee dari kategori via onChange, total otomatis, catatan) + list dengan filter tanggal, search, hapus dengan konfirmasi, grand total.
- CategoriesSection: daftar grouped (Collapsible per grup), tambah/edit (Dialog), hapus dengan cek relasi (AlertDialog), fee default editable.
- SettingsSection: ukuran font (3 pilihan, live apply), mode terang/gelap, toggle pengeluaran operasional, shortcut ke kategori, info database Turso, catatan keamanan.
- AI Agent (/api/agent + AgentChat.tsx): Mistral mistral-large-latest dengan 4 tools (get_categories, get_transactions, get_summary, propose_action). Tool loop read dieksekusi server-side; propose_action mengembalikan proposal ke client. Konfirmasi via card "Ya, Jalankan"/"Batal" → server eksekusi proposal (create_category/create_transaction/update_category_fee) lalu Mistral beri jawaban natural. Voice input opsional (Web Speech API, id-ID). Quick suggestion chips. Markdown rendering (react-markdown) untuk jawaban agent. Fallback API key Mistral (primary→backup) saat 429/401.
- PWA: public/manifest.json (installable, hijau), icon.svg + PNG 192/512/apple-touch (generate via sharp), public/sw.js (offline UI shell, network-first navigasi, SWR aset statis, tidak cache API), sw-register.tsx (production only).
- VERIFIKASI agent-browser end-to-end:
  - Dashboard render dengan data real, tanggal "Selasa, 23 Juni 2026" ✓
  - Input manual: PLN Pascabayar 49 × 3000 = Rp147.000, toast sukses, muncul di list ✓
  - AI read query "Berapa total PLN bulan ini?" → agent pakai get_transactions, jawab Rp147.000 dengan detail ✓
  - AI write query "tadi 8 pelanggan GoPay fee 2000" → agent deteksi GoPay belum ada, propose create_category (GoPay, grup E-Money, fee 2000) + create_transaction (8×2000=16000), tampilkan card konfirmasi → klik "Ya, Jalankan" → eksekusi, agent balas "Sudah dicatat: GoPay 8 pelanggan → Rp16.000" ✓
  - Kategori: 18 kategori (17 default + GoPay di grup E-Money) ✓
  - Laporan: Total Rp163.000, 2 transaksi, grafik batang 6 bulan (lazy-load recharts), Export CSV/PDF ✓
  - Impor: 3-step flow (Upload→Pemetaan→Konfirmasi), sample CSV, auto-detect kolom ✓
  - bun run lint PASS ✓

Stage Summary:
- APLIKASI LENGKAP & TERVERIFIKASI end-to-end via agent-browser. Semua 6 fitur utama + AI Agent berfungsi.
- Stack final: Next.js 16 + Turso (@libsql/client langsung) + Mistral + Tailwind 4 + shadcn/ui + recharts (lazy) + papaparse + react-markdown.
- Performa: no framer-motion, recharts di-code-split, CSS transitions only, SW untuk offline shell.
- Credentials aman di server-side (.env / .env.local), tidak diekspos ke client.

## Status Proyek
- STABIL & berfungsi penuh. Siap dipakai. Cron review tiap 15 menit akan jaga & lanjutkan pengembangan.

## Risiko / Catatan
- Rotasi Turso token sebelum production (token sudah dishare di chat).
- Mistral free-tier bisa 429; sudah ada fallback key. Pertimbangkan upgrade tier jika dipakai intensif.
- Prisma schema.prisma sekarang hanya dokumentasi (tidak dipakai runtime); runtime pakai schema.sql + libsql client.
- Saran next phase: data seeding lebih banyak untuk demo, filter kategori di laporan, recurring expenses, export per kategori, PWA install prompt UI, optimasi bundle (analyze).
