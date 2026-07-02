# Onderhoud-service — NestJS + TypeORM (Rijkswaterstaat DDD)
#
# Eisen (zie ../docs/conventions.md):
#   - Luister op poort 8003 (SERVICE_PORT in .env)
#   - Expose GET /health -> 200
#   - Lees RABBITMQ_URL en DATABASE_URL uit de omgeving
#
# Multi-stage: de build-stage heeft de volledige toolchain (nest-cli, ts),
# de runtime-stage draait met alleen productie-dependencies + de gebouwde dist/.

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8003
CMD ["node", "dist/main.js"]
