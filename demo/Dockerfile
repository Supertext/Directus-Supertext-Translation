# Supertext Translation for Directus: public demo (Railway). Build context = repository root:
#   docker build -f demo/Dockerfile -t supertext-directus-demo .

# 1. Build the extension from this repository.
FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# 2. Directus with the extension and the demo setup hook.
FROM ghcr.io/directus/directus:12.4.1
COPY --from=build --chown=node:node /src/package.json /directus/extensions/directus-extension-supertext-translation/package.json
COPY --from=build --chown=node:node /src/dist /directus/extensions/directus-extension-supertext-translation/dist
COPY --chown=node:node demo/extensions/directus-extension-supertext-demo /directus/extensions/directus-extension-supertext-demo
COPY --chown=node:node demo/entrypoint.cjs /directus/demo-entrypoint.cjs

ENV PROJECT_NAME="Supertext Directus Demo" \
    TELEMETRY=false \
    EXTENSIONS_AUTO_RELOAD=false \
    SUPERTEXT_SOURCE_LANGUAGE=en-US \
    SUPERTEXT_LANGUAGES='{"de-CH":{"politeness":"more"},"fr-CH":{"politeness":"more"},"it-CH":{"politeness":"more"}}'

EXPOSE 8055
CMD ["node", "/directus/demo-entrypoint.cjs"]
