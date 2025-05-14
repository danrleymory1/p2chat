// Tipos e interfaces
interface User {
    id: string;
    name: string;
}

interface Message {
    type: string;
    sender: User;
    content: any;
}

interface EncryptedMessage {
    iv: string;
    data: string;
}

// Constantes
const SIGNALING_SERVER = 'wss://your-signaling-server.com';
const ICE_SERVERS = [
    { urls: 'stun:stun.stunprotocol.org:3478' }, // Usar STUN servers próprios
    { urls: 'stun:stun.voip.blackberry.com:3478' }
    // Não usar STUN/TURN servers do Google para evitar coleta de dados
];

// Classe principal do aplicativo
class SecureChat {
    private socket: WebSocket | null = null;
    private localStream: MediaStream | null = null;
    private peerConnection: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private localUser: User | null = null;
    private remoteUser: User | null = null;
    private roomId: string = '';
    private cryptoKey: CryptoKey | null = null;
    private isInitiator: boolean = false;
    private isScreenSharing: boolean = false;
    private screenShareStream: MediaStream | null = null;
    private originalStream: MediaStream | null = null;
    private unreadMessages: number = 0;
    private chatVisible: boolean = false;
    private pendingCandidates: RTCIceCandidate[] = [];
    private isConnected: boolean = false;
    private encryptionReady: boolean = false;

    // Elementos DOM
    private elements: {[key: string]: HTMLElement | HTMLVideoElement | HTMLInputElement | null} = {
        loginScreen: null,
        callScreen: null,
        joinForm: null,
        username: null,
        roomId: null,
        localVideo: null,
        remoteVideo: null,
        remoteVideoCard: null,
        videoGrid: null,
        chatSidebar: null,
        chatMessages: null,
        chatForm: null,
        chatInput: null,
        roomName: null,
        roomCode: null,
        copyCode: null,
        remoteName: null,
        toggleMicBtn: null,
        toggleCameraBtn: null,
        toggleScreenShareBtn: null,
        toggleChatBtn: null,
        endCallBtn: null,
        closeChatBtn: null,
        connectionIndicator: null,
        chatBadge: null,
        toastContainer: null,
        shareModal: null,
        shareCodeText: null,
        copyShareCode: null,
        closeShareModal: null
    };

    constructor() {
        this.initializeDOM();
        this.addEventListeners();
    }

    private initializeDOM(): void {
        // Capturar todos os elementos necessários da DOM
        this.elements = {
            loginScreen: document.getElementById('loginScreen'),
            callScreen: document.getElementById('callScreen'),
            joinForm: document.getElementById('joinForm'),
            username: document.getElementById('username') as HTMLInputElement,
            roomId: document.getElementById('roomId') as HTMLInputElement,
            localVideo: document.getElementById('localVideo') as HTMLVideoElement,
            remoteVideo: document.getElementById('remoteVideo') as HTMLVideoElement,
            remoteVideoCard: document.getElementById('remoteVideoCard'),
            videoGrid: document.getElementById('videoGrid'),
            chatSidebar: document.getElementById('chatSidebar'),
            chatMessages: document.getElementById('chatMessages'),
            chatForm: document.getElementById('chatForm'),
            chatInput: document.getElementById('chatInput') as HTMLInputElement,
            roomName: document.getElementById('roomName'),
            roomCode: document.getElementById('roomCode'),
            copyCode: document.getElementById('copyCode'),
            remoteName: document.getElementById('remoteName'),
            toggleMicBtn: document.getElementById('toggleMicBtn'),
            toggleCameraBtn: document.getElementById('toggleCameraBtn'),
            toggleScreenShareBtn: document.getElementById('toggleScreenShareBtn'),
            toggleChatBtn: document.getElementById('toggleChatBtn'),
            endCallBtn: document.getElementById('endCallBtn'),
            closeChatBtn: document.getElementById('closeChatBtn'),
            connectionIndicator: document.getElementById('connectionIndicator'),
            chatBadge: document.querySelector('#toggleChatBtn .badge'),
            toastContainer: document.getElementById('toastContainer'),
            shareModal: document.getElementById('shareModal'),
            shareCodeText: document.getElementById('shareCodeText'),
            copyShareCode: document.getElementById('copyShareCode'),
            closeShareModal: document.getElementById('closeShareModal')
        };
    }

    private addEventListeners(): void {
        // Form de login
        this.elements.joinForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.joinRoom();
        });

        // Controles de chamada
        this.elements.toggleMicBtn?.addEventListener('click', () => this.toggleMicrophone());
        this.elements.toggleCameraBtn?.addEventListener('click', () => this.toggleCamera());
        this.elements.toggleScreenShareBtn?.addEventListener('click', () => this.toggleScreenSharing());
        this.elements.toggleChatBtn?.addEventListener('click', () => this.toggleChat());
        this.elements.endCallBtn?.addEventListener('click', () => this.endCall());
        this.elements.closeChatBtn?.addEventListener('click', () => this.toggleChat());

        // Chat
        this.elements.chatForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendChatMessage();
        });

        // Copiar código da sala
        this.elements.copyCode?.addEventListener('click', () => this.copyRoomCode());
        this.elements.copyShareCode?.addEventListener('click', () => this.copyRoomCode());
        this.elements.closeShareModal?.addEventListener('click', () => this.hideShareModal());
    }

    // Gerenciamento de conexão e sala
    private async joinRoom(): Promise<void> {
        const username = (this.elements.username as HTMLInputElement).value.trim();
        let roomId = (this.elements.roomId as HTMLInputElement).value.trim();

        if (!username) {
            this.showToast('Por favor, digite seu nome', 'error');
            return;
        }

        // Se o roomId estiver vazio, gerar um novo
        if (!roomId) {
            roomId = this.generateRoomId();
            (this.elements.roomId as HTMLInputElement).value = roomId;
        }

        this.roomId = roomId;
        this.localUser = {
            id: this.generateUserId(),
            name: username
        };

        try {
            // Gerar chave de criptografia baseada no roomId
            await this.generateCryptoKey(roomId);
            
            // Inicializar a stream de mídia local
            await this.initLocalStream();
            
            // Conectar ao servidor de sinalização
            this.connectToSignalingServer();
            
            // Atualizar UI
            this.updateRoomInfo();
            this.showCallScreen();
            
            this.showToast('Conectado à sala com sucesso!', 'success');
            
            // Exibir modal de compartilhamento do código
            this.showShareModal();
        } catch (error) {
            console.error('Erro ao entrar na sala:', error);
            this.showToast('Erro ao acessar câmera/microfone', 'error');
        }
    }

    private async initLocalStream(): Promise<void> {
        try {
            // Solicitar acesso à câmera e microfone
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            this.localStream = stream;
            
            // Exibir vídeo local
            if (this.elements.localVideo) {
                (this.elements.localVideo as HTMLVideoElement).srcObject = stream;
            }
        } catch (error) {
            console.error('Erro ao acessar mídia local:', error);
            throw error;
        }
    }

    private connectToSignalingServer(): void {
        // Conectar ao servidor WebSocket
        this.socket = new WebSocket(SIGNALING_SERVER);
        
        this.socket.onopen = () => {
            console.log('Conectado ao servidor de sinalização');
            this.updateConnectionStatus('connecting');
            
            // Enviar mensagem de entrada na sala
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'join',
                    roomId: this.roomId,
                    user: this.localUser
                }));
            }
        };
        
        this.socket.onmessage = (event) => {
            this.handleSignalingMessage(JSON.parse(event.data));
        };
        
        this.socket.onerror = (error) => {
            console.error('Erro no WebSocket:', error);
            this.updateConnectionStatus('disconnected');
            this.showToast('Erro de conexão com o servidor', 'error');
        };
        
        this.socket.onclose = () => {
            console.log('Conexão WebSocket fechada');
            this.updateConnectionStatus('disconnected');
        };
    }

    private async handleSignalingMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'room_joined':
                this.isInitiator = message.isInitiator;
                if (this.isInitiator) {
                    console.log('Você é o primeiro participante na sala');
                    this.showSystemMessage('Aguardando outros participantes...');
                } else {
                    console.log('Você entrou em uma sala existente');
                    // Iniciar conexão P2P como non-initiator
                    await this.initiatePeerConnection();
                }
                break;
                
                case 'user_joined':
                    this.remoteUser = message.user;
                    this.updateRemoteUserInfo();
                    this.showSystemMessage(`${this.remoteUser?.name || 'Sem nome'} entrou na chamada`);
                    
                    if (this.isInitiator) {
                        // Iniciar conexão P2P como initiator
                        await this.initiatePeerConnection();
                    }
                    break;
                
            case 'user_left':
                this.handleRemoteUserLeft();
                break;
                
            case 'offer':
                await this.handleRemoteOffer(message.offer);
                break;
                
            case 'answer':
                await this.handleRemoteAnswer(message.answer);
                break;
                
            case 'ice_candidate':
                await this.handleRemoteIceCandidate(message.candidate);
                break;
                
            case 'chat_message':
                // As mensagens de chat virão pelo dataChannel após a conexão
                // Este é apenas um fallback para o caso da conexão estar sendo estabelecida
                if (!this.isConnected && message.encrypted) {
                    try {
                        const decrypted = await this.decryptMessage(message.encrypted);
                        this.displayChatMessage(decrypted, false);
                    } catch (error) {
                        console.error('Erro ao descriptografar mensagem:', error);
                    }
                }
                break;
        }
    }

    private async initiatePeerConnection(): Promise<void> {
        try {
            // Criar conexão RTCPeerConnection
            this.peerConnection = new RTCPeerConnection({
                iceServers: ICE_SERVERS
            });
            
            // Adicionar streams de mídia locais
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    if (this.peerConnection && this.localStream) {
                        this.peerConnection.addTrack(track, this.localStream);
                    }
                });
            }
            
            // Configurar canal de dados
            if (this.isInitiator) {
                this.dataChannel = this.peerConnection.createDataChannel('secureChat', {
                    ordered: true
                });
                this.setupDataChannel();
            } else {
                this.peerConnection.ondatachannel = (event) => {
                    this.dataChannel = event.channel;
                    this.setupDataChannel();
                };
            }
            
            // Configurar handlers de eventos
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingMessage({
                        type: 'ice_candidate',
                        candidate: event.candidate
                    });
                }
            };
            
            this.peerConnection.oniceconnectionstatechange = () => {
                console.log('ICE state:', this.peerConnection?.iceConnectionState);
                if (this.peerConnection?.iceConnectionState === 'connected') {
                    this.updateConnectionStatus('connected');
                    this.isConnected = true;
                    this.showToast('Conexão P2P estabelecida', 'success');
                    
                    // Processa candidatos pendentes se houver
                    this.processPendingCandidates();
                } else if (this.peerConnection?.iceConnectionState === 'disconnected' || 
                          this.peerConnection?.iceConnectionState === 'failed') {
                    this.updateConnectionStatus('disconnected');
                    this.isConnected = false;
                }
            };
            
            this.peerConnection.ontrack = (event) => {
                if (this.elements.remoteVideo && event.streams[0]) {
                    (this.elements.remoteVideo as HTMLVideoElement).srcObject = event.streams[0];
                    this.elements.remoteVideoCard?.classList.remove('hidden');
                    this.elements.videoGrid?.classList.add('has-remote');
                }
            };
            
            // Criar oferta ou aguardar oferta
            if (this.isInitiator) {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);
                
                this.sendSignalingMessage({
                    type: 'offer',
                    offer: offer
                });
            }
        } catch (error) {
            console.error('Erro ao iniciar conexão P2P:', error);
            this.showToast('Erro na conexão P2P', 'error');
        }
    }

    private async handleRemoteOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peerConnection) {
            await this.initiatePeerConnection();
        }
        
        try {
            await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection?.createAnswer();
            await this.peerConnection?.setLocalDescription(answer);
            
            this.sendSignalingMessage({
                type: 'answer',
                answer: answer
            });
        } catch (error) {
            console.error('Erro ao processar oferta remota:', error);
        }
    }

    private async handleRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        try {
            await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Erro ao processar resposta remota:', error);
        }
    }

    private async handleRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        try {
            if (this.peerConnection && this.peerConnection.remoteDescription) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Guardar candidato para adicionar depois de ter o remoteDescription
                this.pendingCandidates.push(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Erro ao adicionar candidato ICE remoto:', error);
        }
    }

    private async processPendingCandidates(): Promise<void> {
        if (this.peerConnection && this.pendingCandidates.length > 0) {
            for (const candidate of this.pendingCandidates) {
                try {
                    await this.peerConnection.addIceCandidate(candidate);
                } catch (error) {
                    console.error('Erro ao adicionar candidato ICE pendente:', error);
                }
            }
            this.pendingCandidates = [];
        }
    }

        private handleRemoteUserLeft(): void {
            this.showSystemMessage(`${this.remoteUser?.name || 'Participante'} saiu da chamada`);
            
            // Resetar elementos do usuário remoto
            if (this.elements.remoteVideo) {
                (this.elements.remoteVideo as HTMLVideoElement).srcObject = null;
            }
            
            this.elements.remoteVideoCard?.classList.add('hidden');
            this.elements.videoGrid?.classList.remove('has-remote');
        
        // Fechar conexão P2P
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        this.remoteUser = null;
        this.isConnected = false;
        this.updateConnectionStatus('connecting');
        
        // Agora somos o initiator para a próxima conexão
        this.isInitiator = true;
    }

    private setupDataChannel(): void {
        if (!this.dataChannel) return;
        
        this.dataChannel.onopen = () => {
            console.log('Canal de dados aberto');
            this.encryptionReady = true;
            this.showSystemMessage('Canal seguro estabelecido');
        };
        
        this.dataChannel.onclose = () => {
            console.log('Canal de dados fechado');
        };
        
        this.dataChannel.onerror = (error) => {
            console.error('Erro no canal de dados:', error);
        };
        
        this.dataChannel.onmessage = async (event) => {
            try {
                // Mensagem criptografada
                const encryptedMessage = JSON.parse(event.data) as EncryptedMessage;
                const decrypted = await this.decryptMessage(encryptedMessage);
                
                // Exibir mensagem
                this.displayChatMessage(decrypted, false);
            } catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        };
    }

    // Funções de criptografia
    private async generateCryptoKey(seed: string): Promise<void> {
        try {
            // Derivar uma chave segura a partir do código da sala
            const encoder = new TextEncoder();
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(seed),
                { name: 'PBKDF2' },
                false,
                ['deriveBits', 'deriveKey']
            );
            
            // Usar salt constante para garantir que ambos os lados gerem a mesma chave
            const salt = encoder.encode('SecureChatE2EE');
            
            // Derivar a chave AES-GCM
            this.cryptoKey = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt: salt,
                    iterations: 100000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        } catch (error) {
            console.error('Erro ao gerar chave criptográfica:', error);
            throw error;
        }
    }

    private async encryptMessage(message: Message): Promise<EncryptedMessage> {
        if (!this.cryptoKey) {
            throw new Error('Chave de criptografia não disponível');
        }
        
        try {
            // Converter mensagem para JSON e então para ArrayBuffer
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(message));
            
            // Gerar IV (Initialization Vector) aleatório
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            
            // Criptografar a mensagem
            const encrypted = await window.crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.cryptoKey,
                data
            );
            
            // Retornar mensagem criptografada como base64 junto com o IV
            return {
                iv: this.arrayBufferToBase64(iv),
                data: this.arrayBufferToBase64(encrypted)
            };
        } catch (error) {
            console.error('Erro ao criptografar mensagem:', error);
            throw error;
        }
    }

    private async decryptMessage(encryptedMessage: EncryptedMessage): Promise<Message> {
        if (!this.cryptoKey) {
            throw new Error('Chave de criptografia não disponível');
        }
        
        try {
            // Converter de base64 para ArrayBuffer
            const iv = this.base64ToArrayBuffer(encryptedMessage.iv);
            const data = this.base64ToArrayBuffer(encryptedMessage.data);
            
            // Descriptografar a mensagem
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.cryptoKey,
                data
            );
            
            // Converter ArrayBuffer para string e depois para objeto
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(decrypted);
            return JSON.parse(jsonString) as Message;
        } catch (error) {
            console.error('Erro ao descriptografar mensagem:', error);
            throw error;
        }
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        
        return window.btoa(binary);
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes.buffer;
    }

    // Funções de chat
    private async sendChatMessage(): Promise<void> {
        const inputElement = this.elements.chatInput as HTMLInputElement;
        const text = inputElement.value.trim();
        
        if (!text) return;
        
        // Limpar input
        inputElement.value = '';
        
        // Criar mensagem
        const message: Message = {
            type: 'chat',
            sender: this.localUser!,
            content: {
                text: text,
                timestamp: new Date().toISOString()
            }
        };
        
        // Exibir mensagem localmente
        this.displayChatMessage(message, true);
        
        // Enviar mensagem criptografada
        try {
            if (this.dataChannel && this.dataChannel.readyState === 'open' && this.encryptionReady) {
                const encrypted = await this.encryptMessage(message);
                this.dataChannel.send(JSON.stringify(encrypted));
            } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                // Fallback: enviar pelo servidor de sinalização (menos seguro)
                const encrypted = await this.encryptMessage(message);
                this.sendSignalingMessage({
                    type: 'chat_message',
                    encrypted: encrypted
                });
            }
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            this.showToast('Erro ao enviar mensagem', 'error');
        }
    }

    private displayChatMessage(message: Message, isOutgoing: boolean): void {
        const messageContainer = document.createElement('div');
        messageContainer.className = `chat-message ${isOutgoing ? 'outgoing' : 'incoming'}`;
        
        // Formatação da hora
        const timestamp = new Date(message.content.timestamp);
        const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Construir HTML da mensagem
        messageContainer.innerHTML = `
            ${!isOutgoing ? `<div class="message-sender">${message.sender.name}</div>` : ''}
            <div class="message-text">${message.content.text}</div>
            <div class="message-time">${timeString}</div>
        `;
        
        // Adicionar à conversa
        this.elements.chatMessages?.appendChild(messageContainer);
        
        // Rolar para o final
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
        
        // Incrementar contador de mensagens não lidas se chat estiver fechado
        if (!isOutgoing && !this.chatVisible) {
            this.unreadMessages++;
            this.updateUnreadBadge();
        }
    }

    private showSystemMessage(text: string): void {
        const messageContainer = document.createElement('div');
        messageContainer.className = 'chat-message system';
        messageContainer.innerHTML = `<p>${text}</p>`;
        
        this.elements.chatMessages?.appendChild(messageContainer);
        
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
    }

    private updateUnreadBadge(): void {
        if (this.elements.chatBadge) {
            if (this.unreadMessages > 0) {
                this.elements.chatBadge.textContent = this.unreadMessages.toString();
                this.elements.chatBadge.classList.remove('hidden');
            } else {
                this.elements.chatBadge.classList.add('hidden');
            }
        }
    }

    // Controles de mídia
    private toggleMicrophone(): void {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            
            if (audioTracks.length > 0) {
                const enabled = !audioTracks[0].enabled;
                audioTracks[0].enabled = enabled;
                
                // Atualizar UI
                this.elements.toggleMicBtn?.classList.toggle('active', enabled);
                
                // Mostrar toast
                this.showToast(
                    enabled ? 'Microfone ativado' : 'Microfone desativado',
                    'info'
                );
            }
        }
    }

    private toggleCamera(): void {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            
            if (videoTracks.length > 0) {
                const enabled = !videoTracks[0].enabled;
                videoTracks[0].enabled = enabled;
                
                // Atualizar UI
                this.elements.toggleCameraBtn?.classList.toggle('active', enabled);
                
                // Mostrar toast
                this.showToast(
                    enabled ? 'Câmera ativada' : 'Câmera desativada',
                    'info'
                );
            }
        }
    }

    private async toggleScreenSharing(): Promise<void> {
        try {
            if (!this.isScreenSharing) {
                // Iniciar compartilhamento de tela
                this.screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });
                
                // Guardar stream original
                this.originalStream = this.localStream;
                
                // Substituir stream local
                this.replaceMediaStream(this.screenShareStream);
                
                // Atualizar UI
                this.elements.toggleScreenShareBtn?.classList.add('active');
                this.isScreenSharing = true;
                
                // Evento para detectar fim do compartilhamento de tela
                this.screenShareStream.getVideoTracks()[0].onended = () => {
                    this.stopScreenSharing();
                };
                
                this.showToast('Compartilhamento de tela iniciado', 'info');
            } else {
                // Parar compartilhamento de tela
                this.stopScreenSharing();
            }
        } catch (error) {
            console.error('Erro ao compartilhar tela:', error);
            this.showToast('Erro ao compartilhar tela', 'error');
        }
    }

    private stopScreenSharing(): void {
        if (this.screenShareStream) {
            // Parar todas as faixas
            this.screenShareStream.getTracks().forEach(track => track.stop());
            
            // Restaurar stream original
            if (this.originalStream) {
                this.replaceMediaStream(this.originalStream);
                this.originalStream = null;
            }
            
            // Atualizar UI
            this.elements.toggleScreenShareBtn?.classList.remove('active');
            this.isScreenSharing = false;
            this.screenShareStream = null;
            
            this.showToast('Compartilhamento de tela finalizado', 'info');
        }
    }

    private async replaceMediaStream(newStream: MediaStream): Promise<void> {
        // Atualizar vídeo local
        if (this.elements.localVideo) {
            (this.elements.remoteVideo as HTMLVideoElement).srcObject = null;

        }
        
        // Atualizar faixas no peer connection
        if (this.peerConnection) {
            const senders = this.peerConnection.getSenders();
            
            // Substituir faixa de vídeo
            const videoSender = senders.find(sender => 
                sender.track && sender.track.kind === 'video'
            );
            
            if (videoSender && newStream.getVideoTracks().length > 0) {
                await videoSender.replaceTrack(newStream.getVideoTracks()[0]);
            }
            
            // Manter faixa de áudio original se não houver áudio na nova stream
            if (this.localStream) {
                const audioSender = senders.find(sender => 
                    sender.track && sender.track.kind === 'audio'
                );
                
                if (audioSender && newStream.getAudioTracks().length === 0 && 
                    this.localStream.getAudioTracks().length > 0) {
                    await audioSender.replaceTrack(this.localStream.getAudioTracks()[0]);
                    }
            }
        }
        
        this.localStream = newStream;
    }

    private toggleChat(): void {
        // Alternar visibilidade do chat
        this.chatVisible = !this.chatVisible;
        this.elements.chatSidebar?.classList.toggle('hidden', !this.chatVisible);
        
        // Quando o chat é aberto, resetar contador de mensagens não lidas
        if (this.chatVisible) {
            this.unreadMessages = 0;
            this.updateUnreadBadge();
        }
    }

    private endCall(): void {
        // Confirmar antes de sair
        if (confirm('Deseja realmente encerrar a chamada?')) {
            // Fechar conexões
            if (this.dataChannel) {
                this.dataChannel.close();
            }
            
            if (this.peerConnection) {
                this.peerConnection.close();
            }
            
            if (this.socket) {
                this.socket.close();
            }
            
            // Parar streams
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            
            if (this.screenShareStream) {
                this.screenShareStream.getTracks().forEach(track => track.stop());
            }
            
            // Voltar para tela de login
            this.showLoginScreen();
        }
    }

    // Utilitários e UI
    private generateRoomId(): string {
        return 'xxxxxx'.replace(/[x]/g, () => {
            return Math.floor(Math.random() * 36).toString(36);
        }).toUpperCase();
    }

    private generateUserId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    private updateRoomInfo(): void {
        if (this.elements.roomName) {
            this.elements.roomName.textContent = `Sala: ${this.roomId}`;
        }
        
        if (this.elements.roomCode) {
            this.elements.roomCode.textContent = this.roomId;
        }
        
        if (this.elements.shareCodeText) {
            this.elements.shareCodeText.textContent = this.roomId;
        }
    }

    private updateRemoteUserInfo(): void {
        if (this.elements.remoteName && this.remoteUser) {
            this.elements.remoteName.textContent = this.remoteUser.name;
        }
    }

    private updateConnectionStatus(status: 'connecting' | 'connected' | 'disconnected'): void {
        if (this.elements.connectionIndicator) {
            // Remover todas as classes anteriores
            this.elements.connectionIndicator.classList.remove('connecting', 'connected', 'disconnected');
            
            // Adicionar classe de acordo com status
            this.elements.connectionIndicator.classList.add(status);
            
            // Atualizar texto
            let statusText = 'Conectando...';
            
            if (status === 'connected') {
                statusText = 'Conectado';
            } else if (status === 'disconnected') {
                statusText = 'Desconectado';
            }
            
            this.elements.connectionIndicator.innerHTML = `
                <i class="fa-solid fa-circle"></i>
                ${statusText}
            `;
        }
    }

    private copyRoomCode(): void {
        const code = this.roomId;
        
        navigator.clipboard.writeText(code)
            .then(() => {
                this.showToast('Código copiado para a área de transferência', 'success');
            })
            .catch(err => {
                console.error('Erro ao copiar código:', err);
                this.showToast('Não foi possível copiar o código', 'error');
            });
    }

    private showShareModal(): void {
        this.elements.shareModal?.classList.remove('hidden');
    }

    private hideShareModal(): void {
        this.elements.shareModal?.classList.add('hidden');
    }

    private showLoginScreen(): void {
        this.elements.loginScreen?.classList.remove('hidden');
        this.elements.callScreen?.classList.add('hidden');
    }

    private showCallScreen(): void {
        this.elements.loginScreen?.classList.add('hidden');
        this.elements.callScreen?.classList.remove('hidden');
    }

    private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
        // Criar elemento toast
        const toastElement = document.createElement('div');
        toastElement.className = `toast ${type}`;
        
        // Ícone com base no tipo
        let icon = '';
        switch (type) {
            case 'success':
                icon = 'fa-circle-check';
                break;
            case 'error':
                icon = 'fa-circle-xmark';
                break;
            case 'info':
                icon = 'fa-circle-info';
                break;
            case 'warning':
                icon = 'fa-triangle-exclamation';
                break;
        }
        
        // Conteúdo do toast
        toastElement.innerHTML = `
            <div class="toast-icon">
                <i class="fa-solid ${icon}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
        `;
        
        // Adicionar ao container
        this.elements.toastContainer?.appendChild(toastElement);
        
        // Remover após 3 segundos
        setTimeout(() => {
            toastElement.remove();
        }, 3000);
    }

    private sendSignalingMessage(message: any): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            // Adicionar informações da sala e usuário
            const fullMessage = {
                ...message,
                roomId: this.roomId,
                userId: this.localUser?.id
            };
            
            this.socket.send(JSON.stringify(fullMessage));
        }
    }
}

// Inicializar o aplicativo quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    const app = new SecureChat();
});