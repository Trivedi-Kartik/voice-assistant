FROM node:20-alpine AS build
WORKDIR /app
# Real bug, caught by actually running the built image (not just building
# it): node:20-alpine has libssl.so.3 (OpenSSL 3.x) as a base dependency, but
# no `openssl` CLI binary — Prisma's engine-selection script uses that binary
# to detect which OpenSSL build to bundle, and silently guessed wrong
# ("openssl-1.1.x") when it found none, generating an engine that fails to
# load at runtime with "Error loading shared library libssl.so.1.1: No such
# file or directory". Installing the real package makes detection accurate
# instead of a wrong guess.
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
# Real bug, caught by an actual deploy attempt (this Dockerfile had never
# been successfully built before): `npm install` runs Prisma's own
# `postinstall: prisma generate` hook automatically, but at this point
# prisma/schema.prisma hadn't been copied into the image yet (that happened
# later, at `COPY . .`) — so postinstall failed and killed the whole build
# before the explicit `npm run prisma:generate` step below ever ran. Copying
# just the schema first is enough for postinstall to succeed.
COPY prisma ./prisma
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Same fix as the build stage — needed here too since this stage runs its
# own `npm install --omit=dev` (see below).
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
# Same fix as the build stage above — this stage's `npm install --omit=dev`
# hit the identical postinstall failure. The Prisma client this generates
# gets overwritten by the build stage's already-correct one two lines down
# anyway; this just needs to not crash the install.
COPY prisma ./prisma
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 8080
CMD ["node", "dist/index.js"]
