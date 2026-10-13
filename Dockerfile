FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY indexer ./indexer
COPY cloud ./cloud
USER node
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "cloud/server.mjs"]
