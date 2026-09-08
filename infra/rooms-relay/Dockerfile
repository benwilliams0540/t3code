FROM node:24.16.0-alpine

WORKDIR /app
COPY infra/rooms-relay/src ./src

ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "src/server.mjs"]
