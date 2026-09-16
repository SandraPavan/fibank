FROM node:24.15.0-bookworm-slim AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global npm@11.9.0
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run prisma:generate --workspace @finbank/api
RUN npm run build --workspace @finbank/api

FROM node:24.15.0-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --global npm@11.9.0
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build --chown=node:node /app/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /app/node_modules/.prisma node_modules/.prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma/engines node_modules/@prisma/engines
COPY --from=build --chown=node:node /app/apps/api/prisma apps/api/prisma
USER node
CMD ["node", "apps/api/dist/main.js"]
