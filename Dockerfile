# Multi-stage build: compile the Vite app, then serve the static output with
# nginx. Vite bakes VITE_* env vars into the JS bundle at build time, not
# runtime -- pass them as build args (see docker-compose.yml or the README
# for how to supply them from a local .env file).

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_SENTRY_DSN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN npm run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
