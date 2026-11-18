FROM node:24-alpine

WORKDIR /app

# No dependencies and no build step: the proxy and the site are plain files.
COPY package.json ./
COPY server ./server
COPY site ./site

ENV PORT=8890
EXPOSE 8890

USER node
CMD ["node", "server/start.mjs"]
