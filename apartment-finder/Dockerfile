# Komo-only image. Yad2 and Homeless need a real, headed Chrome window (see
# src/sources/browser.ts) — both their bot-management vendors fingerprint the
# CDP connection any headless/containerized automation uses, patched browser
# or not, and there is no display in a container to run headed against
# anyway. So this image does not install a browser at all; Komo needs none.
# Run Yad2/Homeless from a machine with a real desktop session instead (see
# the README).
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

# Deliberately NOT built with NODE_ENV=production set. npm treats that as
# `--omit=dev`, and this image compiles itself from source: typescript,
# @types/node, @types/express and the prisma CLI are all devDependencies. With
# them omitted the `tsc` step below fails outright ("Cannot find name
# 'process'"), which is exactly how this image was broken and unnoticed —
# nothing in CI builds it. The prisma CLI is also needed at *runtime* by the
# CMD's `db push`, so devDependencies stay in the final image.
RUN npm ci && npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

COPY public ./public

# Set only now that the build is done: this affects the running app, not npm's
# install behaviour above.
ENV NODE_ENV=production

# The SQLite database lives here, so it must be a volume for the price history
# to survive a restart. (No browser profile to keep any more — this image runs
# Komo only, which needs no browser.)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

EXPOSE 8080

# `db push` is idempotent and creates the schema on first boot.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/src/server.js"]
