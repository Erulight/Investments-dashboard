# Base Image
FROM node:20-alpine AS base

# Dependencies Installation
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

# Build Step
FROM base AS builder
WORKDIR /app

# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables required during the build process
# Add JWT_SECRET and DATABASE_URL arguments and pass them during build
ARG JWT_SECRET
ARG DATABASE_URL
ENV JWT_SECRET=$JWT_SECRET
ENV DATABASE_URL=$DATABASE_URL

ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client and build the app
RUN npx prisma generate
RUN npm run build

# Runner Setup
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security & User
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built files from the builder phase
# Public folder is included in standalone output if it exists
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Switch user
USER nextjs

# Expose the required port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
