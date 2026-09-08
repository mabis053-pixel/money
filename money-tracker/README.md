# MONEY TRACKER

Aplikasi pencatat keuangan harian mobile-first, gratis, dengan Google Sheets sebagai database dan Google Apps Script sebagai REST API.

## Struktur

- index.html
- style.css
- app.js
- manifest.json
- service-worker.js
- assets/icons/icon.svg
- google-apps-script/Code.gs

## Cara cepat

1. Buat Google Spreadsheet bernama `MONEY TRACKER DATABASE`.
2. Buka Extensions > Apps Script.
3. Tempel isi `google-apps-script/Code.gs`.
4. Klik Save.
5. Jalankan fungsi `setupDatabase()` satu kali dan beri izin.
6. Deploy > New deployment > Web app.
7. Execute as: Me.
8. Who has access: Anyone.
9. Salin URL Web App.
10. Buka `app.js`, ubah `API_URL` menjadi URL tersebut.
11. Jalankan frontend melalui localhost/hosting HTTPS. Jangan membuka `index.html` dengan `file://` jika ingin Service Worker/PWA aktif.

## PWA

Untuk PWA, hosting frontend melalui HTTPS. GitHub Pages, Cloudflare Pages, Netlify, atau hosting statis lain dapat digunakan.

## APK Android

Cara termudah untuk tahap awal adalah wrapper WebView/Trusted Web Activity yang menunjuk ke URL frontend HTTPS. Untuk aplikasi produksi, gunakan Android Studio + WebView atau Bubblewrap/TWA. Pastikan frontend sudah HTTPS dan PWA/manifest valid.

## Catatan keamanan

Web App dengan akses `Anyone` adalah endpoint publik. Jangan menyimpan data rahasia/PII sensitif di spreadsheet. Google Spreadsheet tidak dibagikan ke pengguna; pengguna hanya berinteraksi melalui API.

API memvalidasi tanggal, jenis, kategori, nominal, metode pembayaran, ID, dan panjang teks.

## Troubleshooting

- `API_URL belum dikonfigurasi`: ganti nilai `API_URL` di app.js.
- `Gagal mengambil data`: cek deployment Apps Script dan pastikan Who has access = Anyone.
- Setelah mengubah Code.gs: buat deployment versi baru atau edit deployment yang ada.
- Jika PWA tidak aktif: jalankan frontend lewat HTTPS atau localhost, bukan `file://`.
- Jika kategori kosong: jalankan `setupDatabase()` dan pastikan sheet KATEGORI berisi data.
