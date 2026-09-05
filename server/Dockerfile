# The reminder service. One dependency, no build step, no compiler.
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# `npm install` rather than `npm ci`: this package has exactly one dependency and
# no committed lockfile, and a lockfile for a single well-known package is more
# ceremony than protection here. Add one (`npm install --package-lock-only`) the
# day a second dependency appears.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY decide.js index.js ./

# Cloud Run injects PORT; index.js falls back to 8080 for a local run.
EXPOSE 8080
USER node
CMD ["node", "index.js"]
