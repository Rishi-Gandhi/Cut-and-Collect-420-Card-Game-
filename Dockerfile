# The multiplayer server only — not the game client.
#
# The client is static files that ship inside the Electron app (or get served by
# any web host); this image is just the authoritative game server from
# server/index.js. It needs Node, the `ws` package, and the shared rules module.
#
# A Dockerfile rather than leaving it to a platform's Node auto-detection,
# because those buildpacks tend to see a Vite project and try to run the
# frontend build — which is neither needed here nor guaranteed to succeed in a
# server-only image.

FROM node:22-alpine

WORKDIR /app

# Install dependencies as their own layer so it's only redone when the lockfile
# actually changes, rather than on every edit to the game logic.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Only what the server actually imports. Notably not the Electron or React code.
COPY server ./server
COPY shared ./shared

# Platforms override this; the fallback matches local development.
ENV PORT=8787
EXPOSE 8787

# Run unprivileged — the node image ships a `node` user for exactly this.
USER node

CMD ["node", "server/index.js"]
