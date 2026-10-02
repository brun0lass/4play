# Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve
FROM nginx:1.27-alpine
ENV AERIS_API_URL=https://api.aerisone.com.br \
    AERIS_API_HOST=api.aerisone.com.br \
    NGINX_ENVSUBST_FILTER=^AERIS_
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
