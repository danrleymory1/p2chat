import * as http from 'http';
import * as path from 'path';
import express from 'express';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { randomUUID } from 'crypto';

interface User {
    id: string;
    name: string;
    ws: WebSocket;
}

interface Room {
    id: string;
    users: Map<string, User>;
}

class SignalingServer {
    private server: http.Server;
    private app: express.Express;
    private wss: WebSocketServer;
    private rooms: Map<string, Room> = new Map();
    private port: number;

    constructor(port: number = 8080) {
        this.port = port;
        this.app = express();

        const publicPath = path.join(__dirname, 'public');
        this.app.use(express.static(publicPath));
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(publicPath, 'index.html'));
        });

        this.server = http.createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
        this.setupWebSocketServer();
    }

    private setupWebSocketServer(): void {
        this.wss.on('connection', (ws: WebSocket) => {
            let currentUserId: string | null = null;
            let currentRoomId: string | null = null;

            ws.on('message', (rawData: RawData) => {
                try {
                    const messageString = rawData.toString();
                    const message = JSON.parse(messageString);
                    if (message.type === 'join' && message.user && message.user.id && message.roomId) {
                        currentUserId = message.user.id;
                        currentRoomId = message.roomId;
                    }
                    this.handleMessage(message, ws);
                } catch (error) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format or server error' }));
                }
            });

            ws.on('close', () => {
                if (currentUserId && currentRoomId) {
                    const room = this.rooms.get(currentRoomId);
                    const user = room?.users.get(currentUserId);
                    if (room && user) {
                        this.handleUserDisconnect(user, room);
                    }
                }
                currentUserId = null;
                currentRoomId = null;
            });

            ws.on('error', (error) => {});
        });
    }

    private handleMessage(message: any, ws: WebSocket): void {
        const { type, roomId, userId } = message;
        if (!type) return;
        const room = roomId ? this.rooms.get(roomId) : null;
        switch (type) {
            case 'join':
                this.handleJoinRoom(message, ws);
                break;
            case 'offer':
            case 'answer':
            case 'ice_candidate':
            case 'chat_message':
                if (!room || !userId) return;
                this.relayToOthersInRoom(message, room, userId);
                break;
            default:
                ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${type}` }));
        }
    }

    private relayToOthersInRoom(originalMessage: any, room: Room, senderId: string): void {
        const messageToRelay: any = {
            type: originalMessage.type,
            senderId: senderId,
            roomId: room.id
        };
        if (originalMessage.type === 'offer' && originalMessage.offer) {
            messageToRelay.offer = originalMessage.offer;
        } else if (originalMessage.type === 'answer' && originalMessage.answer) {
            messageToRelay.answer = originalMessage.answer;
        } else if (originalMessage.type === 'ice_candidate' && originalMessage.candidate !== undefined) {
            messageToRelay.candidate = originalMessage.candidate;
        } else if (originalMessage.type === 'chat_message' && originalMessage.encrypted) {
            messageToRelay.encrypted = originalMessage.encrypted;
        } else if (originalMessage.payload &&
                   (originalMessage.type === 'offer' ||
                    originalMessage.type === 'answer' ||
                    originalMessage.type === 'ice_candidate' ||
                    originalMessage.type === 'chat_message')) {
            if (originalMessage.type === 'offer') messageToRelay.offer = originalMessage.payload;
            else if (originalMessage.type === 'answer') messageToRelay.answer = originalMessage.payload;
            else if (originalMessage.type === 'ice_candidate') messageToRelay.candidate = originalMessage.payload;
            else if (originalMessage.type === 'chat_message') messageToRelay.encrypted = originalMessage.payload;
        } else if (originalMessage.payload) {
            messageToRelay.payload = originalMessage.payload;
        }
        for (const [targetUserId, targetUser] of room.users) {
            if (targetUserId !== senderId) {
                if (targetUser.ws.readyState === WebSocket.OPEN) {
                    try {
                        targetUser.ws.send(JSON.stringify(messageToRelay));
                    } catch (e) {}
                }
            }
        }
    }

    private handleJoinRoom(data: any, ws: WebSocket): void {
        const { roomId, user } = data;
        if (!roomId || !user || !user.id || !user.name) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid join data' }));
            return;
        }
        const newUser: User = {
            id: user.id,
            name: user.name,
            ws: ws
        };
        let room = this.rooms.get(roomId);
        let isNewRoom = false;
        if (!room) {
            room = this.createRoom(roomId);
            isNewRoom = true;
        }
        const existingUser = room.users.get(user.id);
        if (existingUser) {
            existingUser.ws = ws;
            console.log(`[JOIN] Usuário já existia. id: ${user.id}`);
        } else {
            room.users.set(user.id, newUser);
            console.log(`[JOIN] Novo usuário adicionado. id: ${user.id}`);
        }
        const isInitiatorForClient = isNewRoom || room.users.size === 1;
        ws.send(JSON.stringify({
            type: 'room_joined',
            roomId: roomId,
            isInitiator: isInitiatorForClient,
        }));
        for (const [otherUserId, otherUser] of room.users) {
            if (otherUser.id !== newUser.id) {
                if (otherUser.ws.readyState === WebSocket.OPEN) {
                    otherUser.ws.send(JSON.stringify({
                        type: 'user_joined',
                        user: { id: newUser.id },
                        roomId: roomId
                    }));
                    console.log(`[NOTIFY] Notificado user ${otherUser.id} sobre entrada de ${newUser.id}`);
                }
                if (newUser.ws.readyState === WebSocket.OPEN && !existingUser) {
                    newUser.ws.send(JSON.stringify({
                        type: 'user_joined',
                        user: { id: otherUser.id },
                        roomId: roomId
                    }));
                    console.log(`[NOTIFY] Notificado user ${newUser.id} sobre user existente ${otherUser.id}`);
                }
            }
        }
    }

    private createRoom(roomId: string): Room {
        const newRoom: Room = {
            id: roomId,
            users: new Map()
        };
        this.rooms.set(roomId, newRoom);
        return newRoom;
    }

    private handleUserDisconnect(user: User, room: Room): void {
        if (!room.users.has(user.id)) {
            return;
        }
        room.users.delete(user.id);
        for (const [_remainingUserId, remainingUser] of room.users) {
            if (remainingUser.ws.readyState === WebSocket.OPEN) {
                remainingUser.ws.send(JSON.stringify({
                    type: 'user_left',
                    userId: user.id,
                    roomId: room.id
                }));
            }
        }
        if (room.users.size === 0) {
            this.rooms.delete(room.id);
        }
    }

    public start(): void {
        this.server.listen(this.port);
    }

    public stop(): void {
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.close();
            }
        });
        this.wss.close(() => {
            this.server.close();
        });
    }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const serverInstance = new SignalingServer(PORT);
serverInstance.start();

process.on('SIGINT', () => {
    serverInstance.stop();
    setTimeout(() => process.exit(0), 2000);
});

process.on('SIGTERM', () => {
    serverInstance.stop();
    setTimeout(() => process.exit(0), 2000);
});