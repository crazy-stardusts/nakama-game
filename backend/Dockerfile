FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY src/ src/
COPY tsconfig.json* ./
RUN npm run build

FROM registry.heroiclabs.com/heroiclabs/nakama:3.22.0

COPY --from=builder /app/modules/ /nakama/data/modules/

ENV NAKAMA_DB_ADDRESS=postgres:localdb@postgres:5432/nakama

ENTRYPOINT ["/bin/sh", "-ecx", \
  "/nakama/nakama migrate up --database.address $NAKAMA_DB_ADDRESS && \
   exec /nakama/nakama --name nakama1 --database.address $NAKAMA_DB_ADDRESS --logger.level INFO --session.token_expiry_sec 7200 --runtime.js_entrypoint index.js"]
