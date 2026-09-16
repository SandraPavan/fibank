FROM node:24.15.0-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global npm@11.9.0
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN npm run build --workspace @finbank/web

FROM nginxinc/nginx-unprivileged:1.29.3-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build --chown=nginx:nginx /app/apps/web/dist /usr/share/nginx/html
USER nginx
