#!/bin/bash
# Script untuk menyimulasikan Cold Start pada API Serverless
# Mengukur waktu respon dari HTTP Request.

API_URL=${1:-"http://localhost:3000/api/v1/health/ready"}

echo "Mulai simulasi uji Cold Start ke: $API_URL"
echo "----------------------------------------------------"

# Lakukan request pertama (mensimulasikan Cold Start jika server baru hidup)
echo -n "Request #1 (Kemungkinan Cold Start): "
curl -o /dev/null -s -w "%{time_total} detik\n" "$API_URL"

# Tunggu sejenak
sleep 2

# Lakukan request kedua (mensimulasikan Warm Start)
echo -n "Request #2 (Warm Start)          : "
curl -o /dev/null -s -w "%{time_total} detik\n" "$API_URL"

# Lakukan request ketiga (mensimulasikan Warm Start)
echo -n "Request #3 (Warm Start)          : "
curl -o /dev/null -s -w "%{time_total} detik\n" "$API_URL"

echo "----------------------------------------------------"
echo "Jika selisih waktu Request #1 sangat jauh dibanding Request #2,"
echo "berarti Cold Start penalty cukup signifikan."
