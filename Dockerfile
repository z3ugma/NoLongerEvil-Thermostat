# Stage 1: Build the Next.js frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

# Copy package files and install dependencies
COPY frontend/package*.json ./
RUN npm install

# Copy the rest of the frontend source code
COPY frontend/ ./

# Build the frontend for production
RUN npm run build

# ---

# Stage 2: Prepare the Node.js server
FROM node:20-slim AS server-installer
WORKDIR /app/server

# Copy package files and install production dependencies
COPY server/package*.json ./
RUN npm install --omit=dev

# Copy the rest of the server source code
COPY server/ ./

# ---

# Stage 3: Final production image
FROM node:20-slim
WORKDIR /app

# Install supervisor to manage our processes
RUN apt-get update && apt-get install -y supervisor

# Copy server code and its dependencies from the server-installer stage
COPY --from=server-installer /app/server ./server

# Copy the built frontend and necessary runtime files from the frontend-builder stage
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package*.json ./frontend/
COPY --from=frontend-builder /app/frontend/next.config.ts ./frontend/
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules

# Copy the supervisor configuration and the run script
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY run.sh /usr/local/bin/run.sh

# Make the run script executable
RUN chmod +x /usr/local/bin/run.sh

# Expose the ports for the API (8081, 443) and the frontend (3000)
EXPOSE 8081
EXPOSE 443
EXPOSE 3000

# Set the entrypoint to our run script
CMD ["/usr/local/bin/run.sh"]
