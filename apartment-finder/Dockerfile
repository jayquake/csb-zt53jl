# Komo-only image. Yad2 and Homeless need a real, headed Chrome window (see
# src/sources/browser.ts) — both their bot-management vendors fingerprint the
# CDP connection any headless/containerized automation uses, patched browser
# or not, and there is no display in a container to run headed against
# anyway. So this image does not install a browser at all; Komo needs none.
# Run Yad2/Homeless from a machine with a real desktop session instead (see
# the README).
FROM node:20-alpine

ENV NODE_ENV=production

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
