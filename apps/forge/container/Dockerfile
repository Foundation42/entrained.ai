# Forge TSX Generation Engine - Bun + TypeScript
# Pipeline: Description -> Gemini -> Manifest -> TSX -> WebComponent JS
# Uses esbuild for TSX transpilation

FROM oven/bun:1-debian

# Install Node.js for esbuild (more reliable than bun's bundler for complex cases)
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN bun install

# Copy the generation server
COPY server.ts ./
COPY prompts.ts ./

# Expose the HTTP port
EXPOSE 8080

# Run the server
CMD ["bun", "run", "server.ts"]
