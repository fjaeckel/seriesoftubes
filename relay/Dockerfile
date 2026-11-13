# The Series of Tubes relay: a static binary in an otherwise empty image.
# Build context is relay/:  docker build --build-arg VERSION=x.y.z -f relay/Dockerfile relay
# (or relay/docker-compose.yml: docker compose up -d --build, docs/HOSTING.md)
FROM --platform=$BUILDPLATFORM golang:1.27.4 AS build
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -buildvcs=false -ldflags "-s -w -buildid= -X main.version=${VERSION}" -o /out/relay ./cmd/relay
# The data folder, owned by the unprivileged user the relay runs as.
RUN mkdir -p /out/data && chown 65532:65532 /out/data && chmod 0700 /out/data

FROM scratch
# CA certificates, for dialling other servers' wss:// nodes and fetching servers.json.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/relay /relay
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
# What `relay init` writes into a new config here: listen where the proxy container reaches it, and
# /metrics for a Prometheus on the same Docker network (never publish 9100 on the host).
ENV RELAY_DATA=/data RELAY_LISTEN=0.0.0.0:8080 RELAY_METRICS=0.0.0.0:9100 RELAY_METRICS_PUBLIC=true
VOLUME ["/data"]
EXPOSE 8080 9100
ENTRYPOINT ["/relay"]
# up: on a data folder without a node, init and genesis (or join) from $RELAY_URL, $RELAY_NAME…; then serve.
# On a folder that already holds a server it just serves, as `serve` did (docs/RELAY.md, relay up).
CMD ["up"]
