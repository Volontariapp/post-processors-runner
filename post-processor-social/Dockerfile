# 1. BASE
FROM node:24.14.0-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# 2. DEVELOPMENT & BUILD
FROM base AS builder
COPY . .
RUN yarn install --immutable
RUN yarn build
# Focus on production dependencies and clean cache
RUN yarn workspaces focus --all --production && yarn cache clean --all

# 3. PRODUCTION
FROM node:24.14.0-alpine AS production
LABEL maintainer="Volontariapp"
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4205

# Security: Create system user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nestjs:nodejs /app/config ./config

USER nestjs
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch(\`http://localhost:\${PORT}/health\`).then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["node"]
CMD ["dist/index.js"]
