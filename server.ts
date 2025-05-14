import * as http from 'http';
import * as path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';

// Interfaces
interface User {
    id: string;
    name: string;
    ws: WebSocket;
}

interface Room {
    id: string;
    users: Map<string, User>;
}

// Classe do servidor de sinalização com suporte HTTP
class SignalingServer {
    private server: http.Server;
    private app: express.Express;
    private wss: WebSocketServer;
    private rooms: Map<string, Room> = new Map();
    private port: number;

    constructor(port: number = 8080) {
        this.port = port;
        
        // Configurar Express
        this.app = express();
        
        // Servir arquivos estáticos da pasta 'dist'
        this.app.use(express.static(path.join(__dirname)));
        
        // Rota para a página inicial
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'index.html'));
        });
        
        // Criar servidor HTTP baseado no Express
        this.server = http.createServer(this.app);
        
        // Configurar WebSocket Server no mesmo servidor HTTP
        this.wss = new WebSocketServer({ server: this.server });
        
        this.setupWebSocketServer();
    }

    private setupWebSocketServer(): void {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log('Nova conexão WebSocket estabelecida');

            // Variáveis para acompanhar o usuário e sala
            let currentUser: User | null = null;
            let currentRoom: Room | null = null;

            // Processar mensagens recebidas
            ws.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data.toString());
                    this.handleMessage(data, ws, currentUser, currentRoom);
                    
                    // Atualizar referências de usuário e sala após processamento
                    if (data.type === 'join') {
                        const roomId = data.roomId;
                        if (this.rooms.has(roomId)) {
                            currentRoom = this.rooms.get(roomId)!;
                            currentUser = currentRoom.users.get(data.user.id) || null;
                        }
                    }
                } catch (error) {
                    console.error('Erro ao processar mensagem:', error);
                }
            });

            // Lidar com desconexão
            ws.addEventListener('close', () => {
                if (currentUser && currentRoom) {
                    this.handleUserDisconnect(currentUser, currentRoom);
                }
            });

            // Lidar com erros
            ws.addEventListener('error', (error) => {
                console.error('Erro na conexão WebSocket:', error);
                if (currentUser && currentRoom) {
                    this.handleUserDisconnect(currentUser, currentRoom);
                }
            });
        });
    }

    private handleMessage(data: any, ws: WebSocket, currentUser: User | null, currentRoom: Room | null): void {
        switch (data.type) {
            case 'join':
                this.handleJoinRoom(data, ws);
                break;
            
            case 'offer':
                this.relayOfferToRecipient(data);
                break;
            
            case 'answer':
                this.relayAnswerToRecipient(data);
                break;
            
            case 'ice_candidate':
                this.relayIceCandidateToRecipient(data);
                break;
            
            case 'chat_message':
                this.relayMessageToRecipient(data);
                break;
            
            default:
                console.warn('Tipo de mensagem desconhecido:', data.type);
        }
    }

    private handleJoinRoom(data: any, ws: WebSocket): void {
        const { roomId, user } = data;
        
        // Criar novo usuário
        const newUser: User = {
            id: user.id,
            name: user.name,
            ws: ws
        };
        
        // Verificar se a sala já existe, caso contrário, criar
        if (!this.rooms.has(roomId)) {
            this.createRoom(roomId);
        }
        
        const room = this.rooms.get(roomId)!;
        
        // Adicionar usuário à sala
        room.users.set(user.id, newUser);
        
        // Informar ao usuário que ele entrou na sala
        const isFirstUser = room.users.size === 1;
        ws.send(JSON.stringify({
            type: 'room_joined',
            isInitiator: isFirstUser
        }));
        
        // Notificar outros participantes da sala
        this.notifyUserJoined(newUser, room);
        
        console.log(`Usuário ${user.name} entrou na sala ${roomId}`);
    }

    private createRoom(roomId: string): void {
        this.rooms.set(roomId, {
            id: roomId,
            users: new Map()
        });
        
        console.log(`Nova sala criada: ${roomId}`);
    }

    private notifyUserJoined(newUser: User, room: Room): void {
        // Informar ao novo usuário sobre os outros participantes
        for (const [userId, user] of room.users) {
            // Não enviar para o próprio usuário
            if (userId !== newUser.id) {
                // Informar ao novo usuário sobre esse participante
                newUser.ws.send(JSON.stringify({
                    type: 'user_joined',
                    user: {
                        id: user.id,
                        name: user.name
                    }
                }));
                
                // Informar a esse participante sobre o novo usuário
                user.ws.send(JSON.stringify({
                    type: 'user_joined',
                    user: {
                        id: newUser.id,
                        name: newUser.name
                    }
                }));
            }
        }
    }

    private handleUserDisconnect(user: User, room: Room): void {
        // Remover usuário da sala
        room.users.delete(user.id);
        
        console.log(`Usuário ${user.name} saiu da sala ${room.id}`);
        
        // Notificar outros participantes
        for (const [_, remainingUser] of room.users) {
            remainingUser.ws.send(JSON.stringify({
                type: 'user_left',
                userId: user.id
            }));
        }
        
        // Se não houver mais usuários, remover a sala
        if (room.users.size === 0) {
            this.rooms.delete(room.id);
            console.log(`Sala ${room.id} removida (sem participantes)`);
        }
    }

    private relayOfferToRecipient(data: any): void {
        const { roomId, userId, offer } = data;
        
        if (this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId)!;
            
            // Enviar oferta para todos os outros usuários na sala
            for (const [otherUserId, otherUser] of room.users) {
                if (otherUserId !== userId) {
                    otherUser.ws.send(JSON.stringify({
                        type: 'offer',
                        offer: offer,
                        userId: userId
                    }));
                }
            }
        }
    }

    private relayAnswerToRecipient(data: any): void {
        const { roomId, userId, answer } = data;
        
        if (this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId)!;
            
            // Enviar resposta para todos os outros usuários na sala
            for (const [otherUserId, otherUser] of room.users) {
                if (otherUserId !== userId) {
                    otherUser.ws.send(JSON.stringify({
                        type: 'answer',
                        answer: answer,
                        userId: userId
                    }));
                }
            }
        }
    }

    private relayIceCandidateToRecipient(data: any): void {
        const { roomId, userId, candidate } = data;
        
        if (this.rooms.has(roomId)) {
            const room = this.rooms.get(roomId)!;
            
            // Enviar candidato ICE para todos os outros usuários na sala
            for (const [otherUserId, otherUser] of room.users) {
                if (otherUserId !== userId) {
                    otherUser.ws.send(JSON.stringify({
                        type: 'ice_candidate',
                        candidate: candidate,
                        userId: userId
                    }));
                }
            }
        }
    }

    private relayMessageToRecipient(data: any): void {
        const { roomId, userId, encrypted } = data;
        
        if (this.rooms.has(roomId) && encrypted) {
            const room = this.rooms.get(roomId)!;
            
            // Repassar mensagem criptografada para todos os outros usuários na sala
            for (const [otherUserId, otherUser] of room.users) {
                if (otherUserId !== userId) {
                    otherUser.ws.send(JSON.stringify({
                        type: 'chat_message',
                        encrypted: encrypted,
                        userId: userId
                    }));
                }
            }
        }
    }

    public start(): void {
        this.server.listen(this.port, () => {
            console.log(`Servidor rodando na porta ${this.port}`);
            console.log(`Acesse http://localhost:${this.port} para abrir a aplicação`);
        });
    }

    public stop(): void {
        this.wss.close(() => {
            this.server.close(() => {
                console.log('Servidor encerrado');
            });
        });
    }
}

// Inicializar o servidor
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const server = new SignalingServer(PORT);
server.start();

// Tratamento de sinais para encerramento limpo
process.on('SIGINT', () => {
    console.log('Recebido SIGINT. Encerrando o servidor...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Recebido SIGTERM. Encerrando o servidor...');
    server.stop();
    process.exit(0);
});