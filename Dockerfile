# Website Compliance Checker — image siap jalan + Chromium (mode akurat aktif)
FROM node:22-slim

WORKDIR /app

# Aktifkan fitur browser di UI (di-inline Next.js saat build → harus sebelum npm run build)
ENV NEXT_PUBLIC_BROWSER_ENABLED=true
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

# Browser + dependensi sistem untuk Playwright (mode akurat & tes visual HP)
RUN npx playwright install --with-deps chromium

COPY . .
RUN npm run build

EXPOSE 3000
# $PORT disediakan platform (Railway/Render/Fly); default 3000
CMD ["sh", "-c", "npm run start -- -p ${PORT:-3000}"]
