FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public

RUN npm ci --only=production

RUN mkdir -p /app/data /app/logs

VOLUME ["/app/data", "/app/logs"]

EXPOSE 3000

CMD ["node", "dist/server.js"]