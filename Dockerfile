# Multi-stage Dockerfile for Nalama Family Full-Stack App
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build production bundle (frontend + backend)
COPY . .
RUN npm run build

# Production runtime image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled frontend and backend artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose the standard Cloud Run port
EXPOSE 3000

# Run the backend server (which serves the Vite SPA and API endpoints)
CMD ["node", "dist/server.cjs"]
