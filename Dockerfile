FROM node:20-slim AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM python:3.13-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl && rm -rf /var/lib/apt/lists/*

COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/ server/
COPY --from=web-builder /app/web/.next web/.next
COPY --from=web-builder /app/web/public web/public
COPY --from=web-builder /app/web/node_modules web/node_modules
COPY --from=web-builder /app/web/package.json web/package.json

EXPOSE 8000 3000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
CMD ["/docker-entrypoint.sh"]
