FROM node:24-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @meetbroker/web --include-workspace-root
COPY apps/web apps/web
RUN npm run build --workspace @meetbroker/web

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --chown=nginx:nginx infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=web-build /app/apps/web/dist /usr/share/nginx/html
