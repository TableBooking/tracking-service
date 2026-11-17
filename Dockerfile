FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3004
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY contracts ./contracts
COPY scripts/bootstrap.mjs ./scripts/bootstrap.mjs
USER node
EXPOSE 3004
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/main.js"]
