FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile || yarn install

# Copy source code
COPY tsconfig.json ./
COPY src.ts ./src.ts

# Build TypeScript
RUN yarn build

FROM node:20-alpine

WORKDIR /app

# Install openssl for certificate generation
RUN apk add --no-cache openssl

# Install production dependencies only
COPY package.json yarn.lock* ./
RUN yarn install --production --frozen-lockfile || yarn install --production

# Copy built files
COPY --from=builder /app/lib ./lib

# Create non-root user
RUN addgroup -g 1001 ghost && adduser -u 1001 -G ghost -s /bin/sh -D ghost
USER ghost

# Default port
EXPOSE 8080

CMD ["node", "lib/app.js"]
