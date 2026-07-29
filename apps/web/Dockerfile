FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/web apps/web
RUN npm run build --workspace @meetbroker/web

FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY --from=build /app/apps/web/dist apps/web/dist
RUN npm install --no-save vite@7.2.4
EXPOSE 4173
CMD ["npm", "run", "preview", "--workspace", "@meetbroker/web", "--", "--host", "0.0.0.0", "--port", "4173"]
