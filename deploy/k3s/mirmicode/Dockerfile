# Static map plus a localhost SOCKS forwarder. Build on asym-k1.
# VITE_WORKING_SET_URL matches SAME_ORIGIN_WORKING_SET_PATH in src/adapters/source.ts.

FROM golang:1.22-alpine AS proxy
WORKDIR /src
COPY deploy/k3s/mirmicode/proxy/ ./
RUN go test ./... && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/socksforward .

FROM node:22-alpine AS assets
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_WORKING_SET_URL=/working-set/api/v1/working-set
ENV VITE_WORKING_SET_URL=$VITE_WORKING_SET_URL
# Public BIP (mirmicode.asymetryk.com): bake VITE_PUBLIC_MODE=1 so the UI scrubs.
# Tailnet image leaves this unset. Runtime PUBLIC_MODE=1 on the public pod
# rewrites runtime-config.js and scrubs Working Set JSON. Bake-time alone does
# not scrub the API, so the same image can serve the private tailnet.
ARG VITE_PUBLIC_MODE=
ENV VITE_PUBLIC_MODE=$VITE_PUBLIC_MODE
ARG VITE_PUBLIC_FULL_LIVE=
ENV VITE_PUBLIC_FULL_LIVE=$VITE_PUBLIC_FULL_LIVE
RUN npm test && npm run build && node scripts/check-dist-runtime-config.mjs

FROM caddy:2-alpine
COPY deploy/k3s/mirmicode/Caddyfile.template /etc/mirmicode/Caddyfile.template
COPY deploy/k3s/mirmicode/entrypoint.sh /usr/local/bin/mirmicode-entrypoint
COPY --from=proxy /out/socksforward /usr/local/bin/socksforward
COPY --from=assets /src/dist /srv
RUN chmod 755 /usr/local/bin/mirmicode-entrypoint /usr/local/bin/socksforward \
  && chown -R 1000:1000 /srv /etc/mirmicode
ENV XDG_CONFIG_HOME=/tmp/caddy-config \
    XDG_DATA_HOME=/tmp/caddy-data \
    PUBLIC_MODE= \
    PUBLIC_FULL_LIVE=
USER 1000:1000
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/mirmicode-entrypoint"]
