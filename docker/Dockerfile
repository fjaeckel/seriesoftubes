# The MCP server and the development server in one image (docs/MCP.md, "In a container"). docker.yml builds it and
# publishes it to GHCR for releases only; nothing here is ever deployed to GitHub Pages (docs/adr/0001-github-pages-only.md).
# The base is pinned by digest and kept current by Dependabot (.github/dependabot.yml); CI tests on the same Node major.
FROM node:24-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9

WORKDIR /series-of-tubes

# Dependencies first, exactly as locked, so a change to the code reuses this layer. Every dependency is a dev one (the
# game has none), and the servers need them all. No install scripts run.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts && npm cache clean --force

# Only what the servers read: the game's source and static files, the scripts, and the harness the MCP server plays
# through. Owned by root and read-only to the server, which runs as node.
COPY src ./src
COPY site ./site
COPY scripts ./scripts
COPY tests/harness.js ./tests/harness.js
COPY --chmod=0755 docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# --save-dir /saves needs somewhere the server may write: a volume mounted here takes this ownership.
RUN mkdir /saves && chown node:node /saves
VOLUME /saves

USER node
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
EXPOSE 8080 7777
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
