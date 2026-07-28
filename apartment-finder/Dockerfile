# Chromium comes from Alpine's repos rather than Playwright's downloader: the
# bundled build pulls a large glibc-based image, and the source adapters only
# need a standards-compliant Chromium, not a pinned Playwright revision.
FROM node:20-alpine

RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      # Hebrew glyphs: without a font that covers them, rendered pages are
      # boxes and the text-based parsing extracts nothing.
      font-noto-hebrew

# The system Chromium is used instead of `playwright install`: the CLI's build
# is glibc-based and will not run on Alpine. CHROMIUM_PATH points the browser
# session at it. (Komo needs no browser at all.)
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CHROMIUM_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

COPY public ./public

# The database and the browser profile both live here, so it must be a volume
# for the price history and the bot-challenge cookie to survive a restart.
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8080

# `db push` is idempotent and creates the schema on first boot.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/src/server.js"]
