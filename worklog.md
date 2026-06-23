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

---
Task ID: 7
Agent: main (orchestrator)
Task: Perbaikan model bisnis PPOB (Pendapatan Bersih vs Omzet) + perapian gaya tulisan AI Agent

Work Log:
- Klarifikasi model bisnis dari user: "Pendapatan Bersih" = fee admin (qty × fee_per_unit) = METRIK UTAMA. "Pendapatan Kotor/Omzet" = total uang pembeli = qty × (nominal_tagihan + fee). "Pengeluaran" = hal terpisah, BUKAN pengurang kotor→bersih. Yang benar: Laba Operasional = Bersih - Pengeluaran.
- Migration: ALTER TABLE transactions ADD COLUMN bill_per_unit INTEGER NOT NULL DEFAULT 0 (nominal tagihan per pelanggan, opsional). Update prisma/schema.sql.
- API transactions POST: terima bill_per_unit. GET: kembalikan bill_per_unit.
- API summary: aggregate admin (SUM(total)), omzet (SUM(qty*(bill+fee))), bill. Breakdown & monthlyTrend sekarang punya field admin+omzet (bukan lagi total).
- API export CSV: kolom Tanggal,Kategori,Grup,Jumlah,Tagihan/Unit,Fee/Unit,Pendapatan Bersih,Omzet,Catatan + TOTAL BERSIH + TOTAL OMZET + LABA OPERASIONAL.
- API import: terima bill_per_unit di row.
- Form Transaksi: tambah input "Nominal Tagihan per Pelanggan (opsional)". Preview: "Pendapatan Bersih (fee admin)" + "Omzet (uang dari pembeli)" (muncul kalau bill diisi). Label "Fee per Unit" → "Fee per Pelanggan".
- List transaksi: tampilkan omzet per baris kalau bill > 0. Footer: "Total Pendapatan Bersih" + "Total Omzet".
- Dashboard: hero card = "Pendapatan Hari Ini (fee admin)". StatCard baru param omzet (tampil kalau omzet > admin). Breakdown pakai b.admin.
- Reports: 4 kartu (Pendapatan Bersih, Pendapatan Kotor/Omzet, Jumlah Transaksi, Laba Operasional/Pengeluaran). MonthlyChart 3 bar (hijau=Bersih, biru=Omzet, merah=Pengeluaran) dengan legend. Breakdown table: kolom Qty, Pendapatan Bersih, Omzet. Export PDF: tabel dgn kolom Tagihan+Bersih+Omzet, TOTAL BERSIH + TOTAL OMZET, LABA OPERASIONAL.
- Import: tambah field "Nominal Tagihan/Unit" (auto-detect header: tagihan/bill/nominal/nilai). Sample CSV tambah kolom Tagihan. Preview table: Bersih + Omzet.
- AI Agent system prompt DITULIS ULANG:
  - Section "MODEL BISNIS PPOB" eksplisit: bersih=admin=utama, kotor=omzet, pengeluaran=terpisah. "Jangan pernah bilang pendapatan bersih = kotor - pengeluaran".
  - Section "GAYA BAHASA": singkat, to-the-point, satu kalimat per topik, boleh list •, JANGAN berlebihan bold/italic, JANGAN emoji (kecuali ✓), jangan ---, jangan ulang pertanyaan user.
  - Tool get_summary: return pendapatan_bersih, omzet, transaksi.count, pengeluaran, laba_operasional.
  - Tool get_transactions: return pendapatan_bersih, bill_per_unit, omzet per baris.
  - Tool propose_action payload create_transaction: dukung bill_per_unit (kalau user sebut nominal tagihan).
  - Eksekusi proposal create_transaction: simpan bill_per_unit, log omzet kalau bill>0.
- AgentChat: ActionRow proposal tampilkan "Pendapatan Bersih" + "Omzet" kalau bill ada. Quick suggestions diupdate (contoh: "Catat 10 PDAM fee 2500 tagihan 150rb").

VERIFIKASI agent-browser:
- Input manual: PLN Pascabayar, qty=10, fee=3000 (auto), bill=200000 → preview "Pendapatan Bersih Rp30.000" + "Omzet Rp2.030.000" → simpan sukses, list tampilkan omzet ✓
- AI "Rekap hari ini dong" → jawab: "Pendapatan bersih (fee admin): Rp105.000 • Omzet (uang dari pelanggan): Rp2.105.000 • Transaksi: 2 kali • Pengeluaran: Tidak ada • Laba operasional: Rp105.000 ✓" — terminologi BENAR, gaya rapi (1 emoji ✓, bold secukupnya, no ---) ✓
- Laporan: kartu Pendapatan Bersih Rp105.000 + Pendapatan Kotor Rp2.105.000 + Laba Operasional Rp105.000; grafik 6 bulan 3 bar (hijau/biru/merah) + legend; breakdown table kolom Bersih+Omzet ✓
- bun run lint PASS ✓

Stage Summary:
- Model bisnis PPOB sekarang akurat: Bersih (fee admin) = metrik utama, Omzet = uang pembeli (opsional via nominal tagihan), Pengeluaran = terpisah, Laba Operasional = Bersih - Pengeluaran.
- Gaya tulisan AI Agent dirapikan: singkat, tanpa bold/emoji berlebihan, konsisten terminologi.
- Kolom "Nominal Tagihan per Pelanggan" opsional di form transaksi & impor CSV — tidak membebani kakek kalau tidak diisi, tapi membuka kemampuan hitung omzet.
- Semua section (Dashboard, Transaksi, Laporan, Impor) konsisten pakai terminologi baru.

## Status Proyek
- STABIL & terverifikasi. Model bisnis akurat, AI rapi. Cron review tiap 15 menit tetap aktif.

## Risiko / Saran next
- Data transaksi lama (sebelum perubahan) punya bill_per_unit=0 → omzetnya = bersih. Itu expected (belum pernah dicatat nominalnya).
- Bisa tambah fitur "edit transaksi" (saat ini hanya hapus) agar kakek bisa koreksi nominal tagihan di transaksi lama.
- Bisa tambah toggle "tampilkan omzet" di settings kalau kakek mau mode simple (tanpa omzet).

---
Task ID: 8
Agent: main (orchestrator) — cron review
Task: QA pass + fitur baru (expenses UI, edit transaksi, quick-add) + styling polish (category colors)

Work Log:
- QA awal via agent-browser: dashboard, transaksi, kategori, laporan, impor, settings semua berfungsi. Ditemukan GAP: toggle "Catat pengeluaran operasional" ON di Settings, tapi TIDAK ADA UI untuk menambah pengeluaran. Expense cards tampil di dashboard tapi 0 karena tidak bisa diinput.
- [BUG/GAP FIXED] Buat ExpensesSection.tsx baru: form catat pengeluaran (tanggal, jumlah besar, keterangan + quick-label chips: Listrik tempat, Bensin ke bank, Internet, dll) + list dengan filter tanggal, hapus dengan konfirmasi. Warna destructive (merah) untuk diferensiasi dari pendapatan.
- Update store.ts: tambah 'expenses' ke SectionId.
- Update AppShell.tsx: fetch settings sync expensesEnabled ke store; nav "Pengeluaran" muncul kondisional (sidebar desktop + bottom nav mobile 6-slot saat aktif); render ExpensesSection. Fallback ke transactions kalau expenses dimatikan saat sedang di section expenses.
- [FEATURE] Edit transaksi: API PATCH /api/transactions/[id] (qty, fee, bill, date, note + recompute total). UI: tombol edit (ikon Pencil) di setiap baris TransactionList → EditTransactionDialog dengan field editable + preview Bersih/Omzet real-time. Invalidation query setelah save.
- [FEATURE] Quick-add shortcuts di Dashboard: section "Akses Cepat" menampilkan 6 kategori teratas (berdasarkan breakdown bulan ini, fallback ke kategori populer PLN/PDAM/BPJS/Pulsa). Klik → QuickAddDialog minimal (tanggal, qty besar, fee auto dari kategori, bill opsional, preview Bersih). Tombol simpan menampilkan nominal. 1-klik catat transaksi tanpa buka form penuh.
- [STYLING] Sistem warna kategori (src/lib/category-colors.ts): 10 grup PPOB dapat warna khas (Listrik=amber, Air=sky, Asuransi=emerald, Telko=violet, Pulsa=fuchsia, Multifinance=orange, Gas=blue, TV=rose, E-Money=cyan, Lainnya=slate) + helper getCategoryInitial (2 huruf). Diterapkan di: avatar transaksi (qty + inisial), breakdown dashboard (avatar + progress bar), recent transactions, quick-add buttons, group icon kategori.
- [STYLING] Dashboard breakdown: tambah progress bar relatif per kategori (width = admin/maxAdmin). Baris jadi lebih informatif & visual.
- [STYLING] Quick-add buttons: avatar berwarna per grup + label + fee default, hover shadow.

VERIFIKASI agent-browser:
- Dashboard: Akses Cepat tampil dengan 6 kategori berwarna (PP=PLN Pascabayar, PD=PDAM, BK=BPJS Kesehatan, dll) ✓
- Quick-add PDAM: klik → dialog "Catat Cepat · PDAM", isi qty=5, fee auto 2500, preview "Pendapatan Bersih Rp12.500", Simpan → toast "PDAM dicatat" ✓
- Expenses section: nav "Pengeluaran" tampil (toggle on). Klik Catat → form, isi 20000 + chip "Bensin ke bank", Simpan → muncul di list "-Rp20.000" ✓
- Dashboard setelah expense: Pendapatan Rp117.500 (3 transaksi), Pengeluaran Hari Ini -Rp20.000 ✓
- Edit transaksi: klik edit PDAM → dialog "Edit Transaksi · PDAM", ubah qty 5→8, preview Rp20.000, Simpan → toast "Transaksi diperbarui", list update "8 × Rp2.500 = +Rp20.000" ✓
- Laporan: Pendapatan Bersih Rp125.000, Pendapatan Kotor Rp2.125.000, Laba Operasional Rp105.000 (125k−20k), breakdown table PLN Rp105.000 + PDAM Rp20.000 ✓
- bun run lint PASS ✓

Stage Summary:
- 3 fitur baru: Expenses management UI (menutup gap fungsional), Edit transaksi (koreksi tanpa hapus-ulang), Quick-add shortcuts (catat 1 klik).
- Styling polish: sistem warna kategori 10 grup + progress bar breakdown + avatar inisial — pengenalan visual jauh lebih cepat.
- Semua fitur terverifikasi end-to-end via agent-browser.

## Status Proyek
- STABIL & lebih lengkap. Gap fungsional expenses tertutup. UX lebih cepat (quick-add + edit). Visual lebih kaya (warna kategori).

## Risiko / Saran next
- Mobile bottom-nav jadi 6 slot saat expenses on — masih muat tapi agak rapat di layar kecil. Pertimbangkan sembunyikan "Kategori" di mobile saat expenses on, atau pakai "More" menu.
- Quick-add saat ini tidak ada input nominal tagihan di tampilan awal (ada tapi opsional). Bisa default tampilkan bill field jika kategori biasanya punya tagihan (PLN, PDAM).
- Bisa tambah: recurring expenses (pengeluaran tetap bulanan), filter kategori di laporan, export per kategori, PWA install prompt UI, data backup/restore.
- Transaksi lama (sebelum kolom bill) punya bill=0 → omzet=bersih. Expected.

---
Task ID: 9
Agent: main (orchestrator) — cron review
Task: QA pass + fitur baru (RupiahInput, date presets, PWA install prompt, Tutup Buku nudge) + styling polish (grouped transactions, hover lift, hero pattern)

Work Log:
- QA awal: dashboard, laporan, transaksi semua stabil. Tidak ada bug runtime. Lint PASS.
- [FEATURE] RupiahInput reusable (src/components/app/RupiahInput.tsx): input angka rupiah yang menampilkan pemisah ribuan SAAT mengetik (1500 → "1.500"). Value/onChange tetap digit mentah. Prefix "Rp" opsional di dalam input. Diterapkan di: form Transaksi (fee + bill), EditTransactionDialog (fee + bill), QuickAddDialog (fee + bill), ExpensesSection (amount). Besar manfaat UX untuk lansia — angka besar jelas terbaca.
- [FEATURE] Date range presets di Laporan: 6 tombol cepat (Hari Ini, 7 Hari, 30 Hari, Minggu Ini, Bulan Ini, Bulan Lalu) dengan highlight preset aktif. setRangePreset diperluas dengan today/7d/30d/week/lastMonth. activePreset auto-deteksi untuk highlight tombol yang cocok.
- [FEATURE] PWA Install Prompt (src/components/app/InstallPrompt.tsx): banner dismissible "Pasang GriyaLapor" yang muncul saat beforeinstallprompt event fire. Tombol "Pasang" (trigger install) + "Nanti saja" (dismiss + localStorage). Animate slide-in. Dipasang di AppShell.
- [FEATURE] Dashboard "Tutup Buku" nudge: card amber yang muncul kalau today.count === 0 — "Belum ada catatan hari ini, Yuk catat transaksi hari ini sebelum lupa" + tombol Catat. Mengingatkan kakek untuk tutup buku harian.
- [STYLING] Transactions grouped by date: list transaksi sekarang dikelompokkan per tanggal dengan header sticky (formatLongDate "Selasa, 23 Juni 2026") + total per hari. Dot indicator hijau untuk hari ini. Layout ledger-style lebih mudah dipindai.
- [STYLING] Card hover lift: quick-add buttons & quick links dapat hover:-translate-y-0.5 + hover:shadow-md untuk feedback tactile.
- [STYLING] Hero card decorative pattern: overlay radial-gradient dot pattern (opacity 10%) di hero card pendapatan — subtle visual interest tanpa mengganggu readability.

VERIFIKASI agent-browser:
- Form Transaksi: pilih PLN Pascabayar → fee auto "3.000" (formatted), ketik bill 200000 → tampil "200.000" ✓
- Laporan: 6 preset tombol tampil, klik "7 Hari" → Dari 2026-06-17 Sampai 2026-06-23 ✓
- Transaksi: list grouped "Selasa, 23 Juni 2026" + total per hari ✓
- Dashboard: Akses Cepat + breakdown + hero pattern render ✓
- bun run lint PASS ✓

Stage Summary:
- 4 fitur baru: RupiahInput (format ribuan real-time), date presets Laporan (6 rentang cepat), PWA Install Prompt, Tutup Buku nudge.
- Styling polish: transactions grouped by date (ledger style), card hover lift, hero decorative pattern.
- UX lansia meningkat signifikan: angka rupiah jelas terbaca saat input, rentang tanggal 1-klik, pengingat catat harian, install ke HP mudah.

## Status Proyek
- STABIL & lebih kaya fitur. UX semakin ramah lansia. Lint PASS, semua terverifikasi.

## Risiko / Saran next
- RupiahInput saat ini tidak menyimpan posisi kursor di tengah (selalu di akhir) — cukup untuk input angka, tapi kalau ada edit di tengah bisa awkward. Low priority.
- Install Prompt hanya muncul di browser yang support beforeinstallprompt (Chrome/Edge/Android). Safari iOS butuh instruksi manual "Add to Home Screen" — bisa tambah info card khusus iOS.
- Bisa tambah: recurring expenses, filter kategori di laporan, data backup/restore JSON, search transaksi by amount range, dark mode refinement.
- Mobile bottom-nav 6-slot saat expenses on masih agak rapat — pertimbangkan "More" menu.
