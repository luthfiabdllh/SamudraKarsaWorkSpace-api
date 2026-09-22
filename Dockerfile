FROM node:22-alpine

# Install postgresql-client untuk pg_isready dan libc compatibility
RUN apk add --no-cache libc6-compat postgresql-client

WORKDIR /app

# 1. Salin dan bangun paket bersama @samudrakarsa/shared
COPY SamudraKarsaWorkSpace-Shared /app/SamudraKarsaWorkSpace-Shared
WORKDIR /app/SamudraKarsaWorkSpace-Shared
RUN npm install

# 2. Siapkan dependensi API
WORKDIR /app/SamudraKarsaWorkSpace-api
COPY SamudraKarsaWorkSpace-api/package.json SamudraKarsaWorkSpace-api/package-lock.json ./
RUN npm install

# 3. Salin seluruh source code API
COPY SamudraKarsaWorkSpace-api ./

# 4. Bangun artefak NestJS
RUN npm run build

# 5. Izin eksekusi entrypoint
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
