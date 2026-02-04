# Multi-stage build for AMM application

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend
FROM node:20-alpine AS backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/backend ./src/backend
COPY contracts ./contracts

# Stage 3: Final image
FROM node:20-alpine
WORKDIR /app

# Copy backend
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/src ./src
COPY --from=backend /app/package.json ./

# Copy frontend build
COPY --from=frontend-builder /app/frontend/build ./frontend/build

# Install serve for serving frontend
RUN npm install -g serve

EXPOSE 3001 3000

# Start script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

CMD ["./docker-entrypoint.sh"]
