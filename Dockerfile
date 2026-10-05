FROM node:20-alpine

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile --production=false

# Copy source
COPY . .

# Build
RUN yarn build

# Prune dev dependencies
RUN yarn install --frozen-lockfile --production=true

EXPOSE 3000

CMD ["node", "dist/main.js"]
