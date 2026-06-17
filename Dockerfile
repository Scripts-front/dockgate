# Stage 1: Install production dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# Stage 2: Final image — production only
FROM oven/bun:1
WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source and config files
COPY src ./src
COPY package.json tsconfig.json ./

# Run as non-root bun user (included in oven/bun:1 image)
USER bun

# Document default port (actual port set via PORT env var)
EXPOSE 3000

# Exec-form ENTRYPOINT: Bun is PID 1, receives SIGTERM correctly
# Do NOT use shell-form: ENTRYPOINT ["sh", "-c", "bun run ..."] — breaks SIGTERM
ENTRYPOINT ["bun", "run", "src/index.ts"]
