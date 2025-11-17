ARG BUILD_FROM
FROM $BUILD_FROM

# Add a variable for the release version to make it easier to update
ENV CONVEX_RELEASE="precompiled-2025-10-29-a78fd1e"

# We're on Debian (via build.yaml), so use apt-get
# Install basic tools, then Node.js 22
RUN apt-get update && apt-get install -y curl unzip file libc-bin ca-certificates gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Download and extract the Convex backend binary based on the build architecture
RUN \
  case "$(uname -m)" in \
    aarch64) \
      curl -L "https://github.com/get-convex/convex-backend/releases/download/${CONVEX_RELEASE}/convex-local-backend-aarch64-unknown-linux-gnu.zip" -o convex.zip \
      ;; \
    x86_64) \
      curl -L "https://github.com/get-convex/convex-backend/releases/download/${CONVEX_RELEASE}/convex-local-backend-x86_64-unknown-linux-gnu.zip" -o convex.zip \
      ;; \
    *) \
      echo "Unsupported architecture: $(uname -m)" >&2; \
      exit 1 \
      ;; \
  esac && \
  unzip convex.zip -d /usr/local/bin && \
  rm convex.zip && \
  chmod +x /usr/local/bin/convex-local-backend

# Your local server IP address if self hosting
ENV API_ORIGIN=http://10.0.1.218

# Listener ports: 80 for HTTP, 443 for HTTPS
ENV PROXY_PORT=80
ENV CONTROL_PORT=8081

# Convex deployment settings
ENV CONVEX_SELF_HOSTED_URL=http://127.0.0.1:9755
ENV CONVEX_SELF_HOSTED_ADMIN_KEY=local|01aa43300ecc6cd85cdec2629a81179343cf65e38a753c254e1e54283f63b6dbc628ffda4a
ENV CONVEX_ADMIN_KEY=local|01aa43300ecc6cd85cdec2629a81179343cf65e38a753c254e1e54283f63b6dbc628ffda4a

# Enable debug logging
ENV DEBUG_LOGGING=true

# Convex URL
ENV CONVEX_URL=http://127.0.0.1:9755

# Copy server directory
COPY server/ /server/

# Remove .env.local as it contains conflicting CONVEX_DEPLOYMENT setting
RUN rm -f /server/.env.local

# Copy the startup script and make it executable
COPY run.sh /
RUN chmod a+x /run.sh

# Set the default command to run the script
CMD [ "/run.sh" ]
