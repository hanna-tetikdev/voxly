FROM node:20-alpine

# Install build dependencies for canvas + ffmpeg
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source
COPY . .

# Build and verify
RUN yarn build && ls -la dist/

EXPOSE 3000

CMD ["node", "dist/src/main.js"]
