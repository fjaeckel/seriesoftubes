# The Series of Tubes relay: a static binary in an otherwise empty image.
# Build context is relay/:  docker build --build-arg VERSION=x.y.z -f relay/Dockerfile relay
FROM --platform=$BUILDPLATFORM golang:1.27.4 AS build
ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags "-s -w -buildid= -X main.version=${VERSION}" -o /out/relay ./cmd/relay
# The data folder, owned by the unprivileged user the relay runs as.
RUN mkdir -p /out/data && chown 65532:65532 /out/data && chmod 0700 /out/data

FROM scratch
# CA certificates, for dialling other servers' wss:// nodes and fetching servers.json.
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /out/relay /relay
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
ENV RELAY_DATA=/data
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/relay"]
CMD ["serve"]
