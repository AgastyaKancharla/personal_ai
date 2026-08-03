# Use official Microsoft Playwright image with all browser binaries & dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install npm dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Expose Web Dashboard Port
EXPOSE 3000

# Start 100% self-hosted Web Dashboard & Audit Server
CMD ["npm", "start"]
