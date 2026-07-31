FROM node:25-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @meetbroker/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build --workspace @meetbroker/web

FROM node:25-alpine
WORKDIR /app
COPY apps/web/server.mjs apps/web/server.mjs
COPY --from=build /app/apps/web/dist apps/web/dist
EXPOSE 4173
CMD ["node", "apps/web/server.mjs"]
