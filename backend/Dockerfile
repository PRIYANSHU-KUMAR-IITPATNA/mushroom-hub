FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/jiti ./node_modules/jiti
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 8080
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && node dist/server.js"]
