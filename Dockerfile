FROM node:18-alpine as builder

WORKDIR /app

# Instalar dependências de desenvolvimento
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar código fonte
COPY . .

# Compilar TypeScript
RUN npm run build

# Stage de produção
FROM node:18-alpine

WORKDIR /app

# Copiar arquivos de build e dependências de produção
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/node_modules ./node_modules

# Copiar arquivos estáticos
COPY public ./public

# Expor porta
EXPOSE 8080

# Comando para iniciar o servidor
CMD ["node", "dist/signaling-server.js"]