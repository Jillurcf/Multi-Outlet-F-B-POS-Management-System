FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run prisma:generate -w @pos/api \
  && npm run build -w @pos/shared \
  && npm run build -w @pos/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api ./apps/api
COPY --from=deps /app/packages/shared ./packages/shared
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@pos/api"]
