FROM node:24-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build
COPY apps/api apps/api
RUN npm run build --workspace @meetbroker/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY --from=build /app/apps/api/dist apps/api/dist
COPY apps/api/src/database/migrate.mjs apps/api/src/database/migrate.mjs
COPY apps/api/src/database/migrations apps/api/src/database/migrations
RUN mkdir -p storage/uploads
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@meetbroker/api"]
