# Stage 1: Build da aplicação
FROM node:18-alpine AS builder
WORKDIR /app

# Copiar package.json e package-lock.json (ou yarn.lock, etc.)
# Usar package*.json garante que ambos sejam copiados se o lockfile existir.
COPY package*.json ./

# Instalar todas as dependências (incluindo devDependencies para o build)
RUN npm ci

# Copiar o restante do código fonte da aplicação
# Um arquivo .dockerignore é crucial aqui para evitar copiar node_modules locais, .git, etc.
COPY . .

# Executar o script de build.
# Este script deve compilar TypeScript (server.ts, main.ts) e
# colocar toda a saída necessária (arquivos JS, index.html, style.css)
# em uma pasta 'dist'. Por exemplo, server.js pode ir para 'dist/server.js',
# e os assets do cliente (main.js, index.html, style.css) para 'dist/public/'.
RUN npm run build

# Stage 2: Ambiente de produção
FROM node:18-alpine
WORKDIR /app

# Copiar package.json e package-lock.json do builder para instalar dependências de produção
# Isso garante que usemos as mesmas versões de dependência resolvidas no estágio de build.
COPY --from=builder /app/package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Copiar toda a pasta 'dist' do estágio de builder.
# Esta pasta deve conter todo o código compilado e assets estáticos necessários para o runtime.
COPY --from=builder /app/dist ./dist

# Expor a porta em que a aplicação será executada
EXPOSE 8080

# Definir o comando para executar a aplicação
# Assume que o ponto de entrada do seu servidor é dist/server.js
CMD ["node", "dist/server.js"]