FROM ghcr.io/pnpm/pnpm:latest

RUN pnpm runtime set node 22 -g

ENV PORT=2567
WORKDIR /usr/src/app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 2567
CMD ["pnpm", "start:prod"]
