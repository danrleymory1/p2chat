# SecureChat - Videochamada E2EE (End-to-End Encrypted)

Uma aplicação web de videochamada peer-to-peer (P2P) com criptografia de ponta a ponta que prioriza a privacidade do usuário e não armazena dados em servidores.

![SecureChat Logo](https://via.placeholder.com/800x400?text=SecureChat+E2EE)

## 📋 Características

- **Comunicação P2P** via WebRTC, minimizando a intermediação de servidores
- **Criptografia de ponta a ponta (E2EE)** utilizando AES-GCM 256 bits
- **Sem necessidade de login ou conta**
- **Nenhum dado armazenado** em servidores ou bancos de dados
- **Interface responsiva e intuitiva**
- **Chat de texto** com criptografia E2EE
- **Compartilhamento de tela**
- **Controles de microfone e câmera**

## 🔒 Privacidade e Segurança

- **Zero Data Collection**: Não coletamos, armazenamos ou processamos quaisquer dados pessoais
- **E2EE**: Toda comunicação (áudio, vídeo e mensagens) é criptografada na fonte e descriptografada apenas no destino
- **Salas temporárias**: As salas existem apenas enquanto há participantes ativos
- **STUN/TURN personalizados**: Não utilizamos servidores STUN/TURN de terceiros que podem coletar dados

## 🚀 Como Usar

1. **Acesse a aplicação** no seu navegador
2. **Digite seu nome** e o nome da sala
3. **Clique em "Entrar na Chamada"**
4. **Compartilhe o código da sala** com a pessoa que deseja conversar
5. Quando a outra pessoa entrar com o mesmo código, a conexão P2P será estabelecida automaticamente

## 💻 Tecnologias

- **Frontend**: HTML5, CSS3, TypeScript
- **Comunicação P2P**: WebRTC (getUserMedia, RTCPeerConnection, RTCDataChannel)
- **Criptografia**: Web Crypto API (AES-GCM 256 bits)
- **Sinalização**: WebSockets
- **Servidor**: Node.js com TypeScript

## 🛠️ Desenvolvimento Local

### Pré-requisitos

- Node.js (v14+)
- npm ou yarn
- TypeScript

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/secure-chat-e2ee.git
cd secure-chat-e2ee

# Instale as dependências
npm install

# Compile o servidor
npm run build

# Compile o cliente
npm run compile-client

# Inicie o servidor
npm start
```

### Desenvolvimento

```bash
# Inicie o servidor em modo de desenvolvimento (com hot reload)
npm run dev
```

## 🐳 Docker

```bash
# Construa a imagem
docker build -t secure-chat-e2ee .

# Execute o contêiner
docker run -p 8080:8080 secure-chat-e2ee
```

## 🧩 Arquitetura

### Componentes Principais

- **Interface do Usuário**: Gerencia a experiência do usuário e controles da chamada
- **Módulo WebRTC**: Estabelece e gerencia conexões P2P para áudio, vídeo e dados
- **Módulo de Criptografia**: Implementa criptografia E2EE para todos os canais de comunicação
- **Servidor de Sinalização**: Facilita apenas a troca inicial de mensagens de sinalização

### Fluxo de Segurança

1. A chave de criptografia é derivada do código da sala usando PBKDF2
2. A conexão P2P é estabelecida usando WebRTC
3. Todos os dados são criptografados localmente antes da transmissão
4. Os dados criptografados só podem ser decifrados pelos participantes na mesma sala

## 📄 Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).

## ⚠️ Limitações

- Funciona melhor em redes que permitem conexões P2P diretas
- Alguns ambientes de rede corporativos podem bloquear WebRTC
- Compatível com navegadores modernos que suportam WebRTC e Web Crypto API

---

Desenvolvido com ❤️ para privacidade e segurança