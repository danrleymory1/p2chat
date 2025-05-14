FROM node:18-alpine as builder

WORKDIR /app

# Instalar dependências de desenvolvimento
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar código fonte
COPY . .

# Compilar TypeScript para servidor e cliente
RUN npm run build
RUN npm run compile-client

# Stage de produção
FROM node:18-alpine

WORKDIR /app

# Copiar arquivos de build e dependências de produção
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Copiar arquivos estáticos do cliente
COPY --from=builder /app/index.html ./dist/
COPY --from=builder /app/style.css ./dist/
COPY --from=builder /app/dist/main.js ./dist/

# Expor porta
EXPOSE 8080

# Comando para iniciar o servidor
CMD ["node", "dist/signaling-server.js"]