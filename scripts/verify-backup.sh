#!/usr/bin/env bash
set -eo pipefail

# verify-backup.sh
# Skrip ini mengunduh file pg_dump terbaru dari bucket R2,
# kemudian memasukkannya ke database PostgreSQL lokal sementara (menggunakan Docker)
# untuk memastikan bahwa backup tidak rusak (corrupt) dan dapat dipulihkan dengan sukses.

echo "==============================================="
echo "Verifikasi Pemulihan Backup (Disaster Recovery)"
echo "==============================================="

# Pastikan tool AWS CLI dan Docker tersedia
if ! command -v aws &> /dev/null; then
    echo "ERROR: aws-cli tidak ditemukan. Silakan install terlebih dahulu."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "ERROR: docker tidak ditemukan. Silakan install dan jalankan Docker."
    exit 1
fi

# Konfigurasi bucket
R2_BUCKET="s3://sksks-backup" # Sesuai dengan konfigurasi di backup.yml

echo "[1/4] Mencari backup terbaru di R2..."
LATEST_BACKUP=$(aws s3 ls $R2_BUCKET --recursive | sort | tail -n 1 | awk '{print $4}')

if [ -z "$LATEST_BACKUP" ]; then
    echo "ERROR: Tidak ada file backup ditemukan di bucket $R2_BUCKET."
    exit 1
fi

echo "File backup terbaru: $LATEST_BACKUP"

echo "[2/4] Mengunduh backup..."
DOWNLOAD_PATH="/tmp/latest_backup.sql"
aws s3 cp "$R2_BUCKET/$LATEST_BACKUP" "$DOWNLOAD_PATH"

echo "[3/4] Memutar container PostgreSQL sementara..."
CONTAINER_NAME="sksks-verify-db"
DB_USER="postgres"
DB_PASS="verify123"
DB_NAME="sksks_verify"

# Bersihkan container lama jika ada
docker rm -f $CONTAINER_NAME 2>/dev/null || true

# Jalankan Postgres 15 (sesuai Supabase)
docker run --name $CONTAINER_NAME \
    -e POSTGRES_PASSWORD=$DB_PASS \
    -e POSTGRES_USER=$DB_USER \
    -e POSTGRES_DB=$DB_NAME \
    -d postgres:15

echo "Menunggu database siap..."
sleep 10 # Tunggu postgres inisialisasi

echo "[4/4] Menguji pemulihan (restore) data..."
# Catatan: Kita abaikan error pembuatan role yang biasanya ada di dump Supabase.
docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -v ON_ERROR_STOP=1 < "$DOWNLOAD_PATH" > /dev/null

echo "==============================================="
echo "✅ VERIFIKASI BERHASIL!"
echo "Backup $LATEST_BACKUP dapat dipulihkan tanpa galat struktural."
echo "==============================================="

# Bersihkan resources
docker rm -f $CONTAINER_NAME
rm -f "$DOWNLOAD_PATH"
