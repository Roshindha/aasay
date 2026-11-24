# Full Debian image: the patch gate needs git installed at runtime.
FROM node:22-bookworm
RUN corepack enable && corepack prepare pnpm@8.9.2 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm start -H 0.0.0.0 -p ${PORT:-3000}"]
