#!/bin/sh
set -e

echo "=================================================="
echo "🚀 Memulai Samudra Karsa API Server Container"
echo "=================================================="

# Tunggu sampai Postgres benar-benar siap menerima koneksi
echo "⏳ Menunggu database PostgreSQL siap..."
until pg_isready -h "${DATABASE_HOST:-postgres}" -p "${DATABASE_PORT:-5432}" -U "${POSTGRES_USER:-postgres}"; do
  echo "   Postgres belum siap, mencoba lagi dalam 1 detik..."
  sleep 1
done
echo "✅ PostgreSQL siap dan terhubung!"

# Jalankan migrasi Drizzle
echo "📦 Menjalankan migrasi database Drizzle..."
npm run db:migrate
echo "✅ Migrasi database selesai!"

# Jalankan seeder data awal jika diizinkan
if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "🌱 Menjalankan seed data awal (divisi, periode, akun uji)..."
  SEED_ALLOW=1 npm run db:seed || echo "ℹ️ Seeder dilewati atau data sudah ada."
fi

echo "=================================================="
echo "🌟 Menjalankan aplikasi NestJS di port ${PORT:-3000}..."
echo "=================================================="

exec "$@"
