FROM node:22-alpine AS base

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apk add --no-cache \
    ca-certificates \
    libgcc \
    libstdc++ \
    && rm -rf /var/cache/apk/*

FROM base AS builder

ENV NODE_ENV=development

RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

COPY package.json package-lock.json ./

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

RUN npx tsc --project server/tsconfig.json

FROM base AS production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p data logs

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "--experimental-vm-modules", "./dist-server/server/index.js"]
