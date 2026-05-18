# MOTION.AI — Kling Motion Control Studio

Aplikasi Next.js App Router untuk membuat video Motion Control memakai referensi image + video, upload langsung ke Cloudinary (tanpa kirim file besar ke API route Next.js), lalu generate/status via backend route yang aman.

## 1) Install & Run
```bash
npm install
npm run dev
```

## 2) Setup Environment Lokal
1. Copy `.env.example` menjadi `.env.local`
2. Isi value yang diperlukan.

```env
MAGNIFIC_API_KEY=your_magnific_or_freepik_api_key
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your_unsigned_upload_preset
```

## 3) Setup Cloudinary
1. Login Cloudinary
2. Buka **Settings** → **Upload**
3. Buat **Unsigned Upload Preset**
4. (Opsional) set folder default: `motion-ai`
5. Masukkan cloud name dan preset ke env lokal/Vercel.

## 4) Setup Vercel
1. Import repository dari GitHub
2. Isi environment variables:
   - `MAGNIFIC_API_KEY`
   - `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
   - `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
3. Deploy

## 5) Tips Motion Control
- Gunakan video pendek 3–10 detik
- Untuk testing cepat gunakan 2–5 MB
- Gambar karakter harus jelas
- Hindari konten vulgar/offensive
- Jika status `IN_PROGRESS`, tunggu lalu klik cek status

## Arsitektur Singkat
- Frontend upload image/video **langsung ke Cloudinary unsigned upload**.
- Frontend hanya kirim URL (`imageUrl`, `videoUrl`) ke `/api/generate`.
- `/api/generate` dan `/api/status` memanggil API Magnific via server dengan `MAGNIFIC_API_KEY`.
- History task disimpan di `localStorage` (maksimal 10 item).
- PWA aktif via `public/manifest.json` + `public/sw.js`.
