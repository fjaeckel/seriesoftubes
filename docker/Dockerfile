FROM node:26-slim

COPY . /series-of-tubes
WORKDIR /series-of-tubes

RUN npm install

COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && chown -R node:node /series-of-tubes

USER node

EXPOSE 8080 7777

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
