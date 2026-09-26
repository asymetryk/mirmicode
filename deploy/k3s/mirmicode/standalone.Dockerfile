# Standalone Mirmicode; build and import on asym-k1, never on the operator Mac.
FROM node:22-alpine AS assets
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ENV VITE_FEED_SOURCE=server
RUN npm test && npm run build

FROM python:3.12-alpine
WORKDIR /app
COPY server/ /app/server/
COPY integrations/ /app/integrations/
COPY --from=assets /src/dist /app/dist
RUN python3 -m unittest discover -s /app/server -p 'test_*.py' && \
    addgroup -S mirmicode && adduser -S -G mirmicode -u 10001 mirmicode && \
    mkdir -p /data && chown -R mirmicode:mirmicode /data /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    MIRMICODE_DB=/data/mirmicode.sqlite3 \
    MIRMICODE_STATIC=/app/dist \
    MIRMICODE_TOKEN_FILE=/run/secrets/ingest-token
USER 10001:10001
EXPOSE 8080
CMD ["python3", "/app/server/mirmicode.py"]
