# Forge 2.0 Bundler Container - v2
FROM oven/bun:1-debian

WORKDIR /app

# Install Node.js for esbuild (native binary is faster than WASM)
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install dependencies
RUN bun install

# Copy server code
COPY server.ts ./

# Build version marker
ENV FORGE_BUILD_VERSION=5

# Expose port
EXPOSE 8080

# Run the server
CMD ["bun", "run", "server.ts"]
