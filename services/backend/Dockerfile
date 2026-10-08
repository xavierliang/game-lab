FROM node:22-bookworm-slim
WORKDIR /srv/game-lab
COPY services/backend ./services/backend
COPY tooling/registry.mjs ./tooling/registry.mjs
COPY games ./games
COPY site.config.json ./site.config.json
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8810 DATA_DIR=/data
EXPOSE 8810
CMD ["node","services/backend/server.mjs"]
