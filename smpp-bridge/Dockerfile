# SMPP Bridge production image
# Build from repo root: docker compose build smpp-bridge
FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY smpp-bridge/package.json ./package.json
RUN pnpm install

COPY prisma/schema.prisma ./prisma/schema.prisma
RUN pnpm exec prisma generate --schema=./prisma/schema.prisma --generator=bridge

COPY smpp-bridge/src ./src
COPY smpp-bridge/tsconfig.json ./tsconfig.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001
CMD ["node", "--import", "tsx/esm", "src/index.ts"]
