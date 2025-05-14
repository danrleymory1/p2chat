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
const SIGNALING_SERVER = 'ws://localhost:8080';
const ICE_SERVERS = [
    { urls: "stun:stun1.l.google.com:3478" },
    { urls: "stun:stun3.l.google.com:5349" },
    { urls: "stun:stun4.l.google.com:19302" }
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
    private isAudioEnabled: boolean = true;
    private isVideoEnabled: boolean = true;
    private isBackgroundBlurred: boolean = false;
    private blurCanvasInterval: number | null = null;

    // Elementos DOM
    private elements: {[key: string]: HTMLElement | HTMLVideoElement | HTMLInputElement | HTMLButtonElement | null} = {
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
        toggleBlurBtn: null, // Novo botão para borrar o fundo
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
        this.adjustUIForWindowSize();
    }

    private initializeDOM(): void {
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
            toggleMicBtn: document.getElementById('toggleMicBtn') as HTMLButtonElement,
            toggleCameraBtn: document.getElementById('toggleCameraBtn') as HTMLButtonElement,
            toggleScreenShareBtn: document.getElementById('toggleScreenShareBtn') as HTMLButtonElement,
            toggleChatBtn: document.getElementById('toggleChatBtn') as HTMLButtonElement,
            toggleBlurBtn: document.getElementById('toggleBlurBtn') as HTMLButtonElement,
            endCallBtn: document.getElementById('endCallBtn') as HTMLButtonElement,
            closeChatBtn: document.getElementById('closeChatBtn') as HTMLButtonElement,
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
        this.elements.joinForm?.addEventListener('submit', (e) => { e.preventDefault(); this.joinRoom(); });
        this.elements.toggleMicBtn?.addEventListener('click', () => this.toggleMicrophone());
        this.elements.toggleCameraBtn?.addEventListener('click', () => this.toggleCamera());
        this.elements.toggleScreenShareBtn?.addEventListener('click', () => this.toggleScreenSharing());
        this.elements.toggleChatBtn?.addEventListener('click', () => this.toggleChat());
        this.elements.toggleBlurBtn?.addEventListener('click', () => this.toggleBackgroundBlur());
        this.elements.endCallBtn?.addEventListener('click', () => this.endCall());
        this.elements.closeChatBtn?.addEventListener('click', () => this.toggleChat());
        this.elements.chatForm?.addEventListener('submit', (e) => { e.preventDefault(); this.sendChatMessage(); });
        this.elements.copyCode?.addEventListener('click', () => this.copyRoomCode());
        this.elements.copyShareCode?.addEventListener('click', () => this.copyRoomCode());
        this.elements.closeShareModal?.addEventListener('click', () => this.hideShareModal());
        
        // Ajustar a interface quando o tamanho da janela muda
        window.addEventListener('resize', () => this.adjustUIForWindowSize());
        
        // Tornar as telas de chamada e login sempre ocupar a altura da janela do navegador
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        window.addEventListener('resize', () => {
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        });
    }

    private adjustUIForWindowSize(): void {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        // Ajustar o tamanho do container principal
        const appContainer = document.querySelector('.app-container') as HTMLElement;
        if (appContainer) {
            appContainer.style.height = `calc(var(--vh, 1vh) * 100)`;
            appContainer.style.maxHeight = `calc(var(--vh, 1vh) * 100)`;
            appContainer.style.overflowY = 'hidden';
        }
        
        // Ajustar as telas de login e chamada
        if (this.elements.loginScreen) {
            (this.elements.loginScreen as HTMLElement).style.height = `calc(var(--vh, 1vh) * 100)`;
            (this.elements.loginScreen as HTMLElement).style.maxHeight = `calc(var(--vh, 1vh) * 100)`;
        }
        
        if (this.elements.callScreen) {
            (this.elements.callScreen as HTMLElement).style.height = `calc(var(--vh, 1vh) * 100)`;
            (this.elements.callScreen as HTMLElement).style.maxHeight = `calc(var(--vh, 1vh) * 100)`;
        }
    }

    private async joinRoom(): Promise<void> {
        const username = (this.elements.username as HTMLInputElement).value.trim();
        let roomId = (this.elements.roomId as HTMLInputElement).value.trim();

        if (!username) {
            this.showToast('Por favor, digite seu nome', 'error');
            return;
        }

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
            await this.generateCryptoKey(roomId);

            try {
                await this.initLocalStream();
                
                // Definir estados iniciais para áudio e vídeo (ambos ativados)
                this.isAudioEnabled = true;
                this.isVideoEnabled = true;
                this.updateButtonStates();
            } catch (mediaError) {
                this.localStream = null;
                this.isAudioEnabled = false;
                this.isVideoEnabled = false;
                this.showToast('Sem acesso à câmera/microfone. Você poderá usar apenas o chat de texto.', 'warning');
            }

            this.connectToSignalingServer();
            this.updateRoomInfo();
            this.showCallScreen();
            this.showToast(`Conectado à sala "${roomId}" com sucesso!`, 'success');
            this.showShareModal();

        } catch (error) {
            this.showToast('Erro ao entrar na sala. Verifique o console para detalhes.', 'error');
        }
    }

    private async initLocalStream(): Promise<void> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            this.localStream = stream;
            if (this.elements.localVideo) {
                (this.elements.localVideo as HTMLVideoElement).srcObject = stream;
            }
        } catch (error) {
            throw error;
        }
    }

    private connectToSignalingServer(): void {
        this.socket = new WebSocket(SIGNALING_SERVER);

        this.socket.onopen = () => {
            this.updateConnectionStatus('connecting');
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const joinMessage = {
                    type: 'join',
                    roomId: this.roomId,
                    user: this.localUser
                };
                this.socket.send(JSON.stringify(joinMessage));
            }
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data as string);
                this.handleSignalingMessage(message);
            } catch (error) {
                this.showToast("Erro ao processar mensagem do servidor.", "error");
            }
        };

        this.socket.onerror = () => {
            this.updateConnectionStatus('disconnected');
            this.showToast('Erro de conexão com o servidor de sinalização', 'error');
        };

        this.socket.onclose = () => {
            this.updateConnectionStatus('disconnected');
            this.showToast('Desconectado do servidor de sinalização', 'warning');
        };
    }

    private async handleSignalingMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'room_joined':
                this.isInitiator = message.isInitiator;
                if (!this.isInitiator) {
                    await this.initiatePeerConnection();
                }
                break;

            case 'user_joined':
                this.remoteUser = message.user;
                this.updateRemoteUserInfo();
                if (this.isInitiator) {
                    await this.initiatePeerConnection();
                }
                break;

            case 'user_left':
                this.handleRemoteUserLeft();
                break;

            case 'offer':
                if (message.offer) {
                    await this.handleRemoteOffer(message.offer);
                }
                break;

            case 'answer':
                if (message.answer) {
                    await this.handleRemoteAnswer(message.answer);
                }
                break;

            case 'ice_candidate':
                if (message.candidate) {
                    await this.handleRemoteIceCandidate(message.candidate);
                }
                break;

            case 'chat_message':
                if (!this.isConnected && message.encrypted) {
                    try {
                        const decrypted = await this.decryptMessage(message.encrypted);
                        this.displayChatMessage(decrypted, false);
                    } catch (error) {
                        this.showToast("Erro ao descriptografar mensagem de chat.", "error");
                    }
                }
                break;
        }
    }

    private async initiatePeerConnection(): Promise<void> {
        try {
            this.peerConnection = new RTCPeerConnection({
                iceServers: ICE_SERVERS
            });

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    if (this.peerConnection && this.localStream) {
                        this.peerConnection.addTrack(track, this.localStream);
                    }
                });
            }

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

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingMessage({
                        type: 'ice_candidate',
                        candidate: event.candidate.toJSON()
                    });
                }
            };

            this.peerConnection.oniceconnectionstatechange = () => {
                const state = this.peerConnection?.iceConnectionState;
                if (state === 'connected' || state === 'completed') {
                    this.updateConnectionStatus('connected');
                    this.isConnected = true;
                    this.processPendingCandidates();
                } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                    this.updateConnectionStatus('disconnected');
                    this.isConnected = false;
                } else if (state === 'new' || state === 'checking') {
                    this.updateConnectionStatus('connecting');
                    this.isConnected = false;
                }
            };

            this.peerConnection.ontrack = (event) => {
                if (this.elements.remoteVideo && event.streams && event.streams[0]) {
                    (this.elements.remoteVideo as HTMLVideoElement).srcObject = event.streams[0];
                    this.elements.remoteVideoCard?.classList.remove('hidden');
                    this.elements.videoGrid?.classList.add('has-remote');
                }
            };

            if (this.isInitiator) {
                const offer = await this.peerConnection.createOffer();
                await this.peerConnection.setLocalDescription(offer);

                this.sendSignalingMessage({
                    type: 'offer',
                    offer: offer
                });
            }
        } catch (error) {
            this.showToast('Erro crítico na conexão P2P. Verifique o console.', 'error');
        }
    }

    private async handleRemoteOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peerConnection) {
            await this.initiatePeerConnection();
        }

        try {
            await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.peerConnection?.createAnswer();
            if (answer) {
                await this.peerConnection?.setLocalDescription(answer);

                this.sendSignalingMessage({
                    type: 'answer',
                    answer: answer
                });
            }
        } catch (error) {
            this.showToast('Erro ao processar oferta. Verifique o console.', 'error');
        }
    }

    private async handleRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        try {
            await this.peerConnection?.setRemoteDescription(new RTCSessionDescription(answer));
            this.processPendingCandidates();
        } catch (error) {
            this.showToast('Erro ao processar resposta. Verifique o console.', 'error');
        }
    }

    private async handleRemoteIceCandidate(candidateInit: RTCIceCandidateInit | null): Promise<void> {
        if (!candidateInit || !candidateInit.candidate) {
            return;
        }

        try {
            const rtcIceCandidate = new RTCIceCandidate(candidateInit);
            if (this.peerConnection && this.peerConnection.remoteDescription) {
                await this.peerConnection.addIceCandidate(rtcIceCandidate);
            } else {
                this.pendingCandidates.push(rtcIceCandidate);
            }
        } catch (error) {
            this.showToast('Erro ao adicionar candidato ICE. Verifique o console.', 'error');
        }
    }

    private async processPendingCandidates(): Promise<void> {
        if (this.peerConnection && this.peerConnection.remoteDescription && this.pendingCandidates.length > 0) {
            const candidatesToProcess = [...this.pendingCandidates];
            this.pendingCandidates = [];

            for (const candidate of candidatesToProcess) {
                try {
                    await this.peerConnection.addIceCandidate(candidate);
                } catch (error) {
                    this.showToast("Erro ao adicionar candidato ICE pendente.", "error");
                }
            }
        }
    }

    private handleRemoteUserLeft(): void {
        if (this.elements.remoteVideo) {
            (this.elements.remoteVideo as HTMLVideoElement).srcObject = null;
        }

        this.elements.remoteVideoCard?.classList.add('hidden');
        this.elements.videoGrid?.classList.remove('has-remote');

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
        this.encryptionReady = false;
        this.updateConnectionStatus('connecting');
        this.isInitiator = true;
        this.pendingCandidates = [];
    }

    private setupDataChannel(): void {
        if (!this.dataChannel) {
            return;
        }

        this.dataChannel.onopen = () => {
            this.encryptionReady = true;
        };

        this.dataChannel.onclose = () => {
            this.encryptionReady = false;
        };

        this.dataChannel.onmessage = async (event) => {
            try {
                const encryptedMessage = JSON.parse(event.data as string) as EncryptedMessage;
                const decrypted = await this.decryptMessage(encryptedMessage);
                this.displayChatMessage(decrypted, false);
            } catch (error) {
                this.showToast("Erro ao receber mensagem criptografada.", "error");
            }
        };
    }

    private async generateCryptoKey(seed: string): Promise<void> {
        try {
            const encoder = new TextEncoder();
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                encoder.encode(seed),
                { name: 'PBKDF2' },
                false,
                ['deriveBits', 'deriveKey']
            );
            const salt = encoder.encode('SecureChatE2EE');
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
            this.showToast("Falha crítica ao gerar chave de segurança!", "error");
            throw error;
        }
    }

    private async encryptMessage(message: Message): Promise<EncryptedMessage> {
        if (!this.cryptoKey) {
            throw new Error('Chave de criptografia não disponível');
        }
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(message));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                this.cryptoKey,
                data
            );
            return {
                iv: this.arrayBufferToBase64(iv.buffer),
                data: this.arrayBufferToBase64(encrypted)
            };
        } catch (error) {
            throw error;
        }
    }

    private async decryptMessage(encryptedMessage: EncryptedMessage): Promise<Message> {
        if (!this.cryptoKey) {
            throw new Error('Chave de criptografia não disponível');
        }
        try {
            const iv = this.base64ToArrayBuffer(encryptedMessage.iv);
            const data = this.base64ToArrayBuffer(encryptedMessage.data);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                this.cryptoKey,
                data
            );
            const decoder = new TextDecoder();
            const jsonString = decoder.decode(decrypted);
            return JSON.parse(jsonString) as Message;
        } catch (error) {
            this.showToast("Falha ao descriptografar mensagem recebida.", "error");
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

    private async sendChatMessage(): Promise<void> {
        const inputElement = this.elements.chatInput as HTMLInputElement;
        const text = inputElement.value.trim();

        if (!text) return;

        inputElement.value = '';

        const message: Message = {
            type: 'chat',
            sender: this.localUser!,
            content: {
                text: text,
                timestamp: new Date().toISOString()
            }
        };

        this.displayChatMessage(message, true);

        try {
            if (this.dataChannel && this.dataChannel.readyState === 'open' && this.encryptionReady) {
                const encrypted = await this.encryptMessage(message);
                this.dataChannel.send(JSON.stringify(encrypted));
            } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const encrypted = await this.encryptMessage(message);
                this.sendSignalingMessage({
                    type: 'chat_message',
                    encrypted: encrypted
                });
            } else {
                this.showToast('Falha ao enviar mensagem: sem conexão.', 'error');
            }
        } catch (error) {
            this.showToast('Erro ao enviar mensagem de chat.', 'error');
        }
    }

    private displayChatMessage(message: Message, isOutgoing: boolean): void {
        const messageContainer = document.createElement('div');
        messageContainer.className = `chat-message ${isOutgoing ? 'outgoing' : 'incoming'}`;

        const timestamp = new Date(message.content.timestamp);
        const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageContainer.innerHTML = `
            ${!isOutgoing ? `<div class="message-sender">${message.sender.name}</div>` : ''}
            <div class="message-text">${message.content.text}</div>
            <div class="message-time">${timeString}</div>
        `;

        this.elements.chatMessages?.appendChild(messageContainer);
        if (this.elements.chatMessages) {
            this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }

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

    private toggleMicrophone(): void {
        if (this.localStream) {
            const audioTracks = this.localStream.getAudioTracks();
            if (audioTracks.length > 0) {
                this.isAudioEnabled = !audioTracks[0].enabled;
                audioTracks[0].enabled = this.isAudioEnabled;
                this.updateButtonStates();
            }
        }
    }

    private toggleCamera(): void {
        if (this.localStream) {
            const videoTracks = this.localStream.getVideoTracks();
            if (videoTracks.length > 0) {
                this.isVideoEnabled = !videoTracks[0].enabled;
                videoTracks[0].enabled = this.isVideoEnabled;
                this.updateButtonStates();
                if (this.elements.localVideo) {
                    (this.elements.localVideo as HTMLVideoElement).style.display = this.isVideoEnabled ? 'block' : 'none';
                }
            }
        }
    }

    private async toggleBackgroundBlur(): Promise<void> {
        this.isBackgroundBlurred = !this.isBackgroundBlurred;
        this.updateButtonStates();
        
        if (!this.localStream) return;
        
        // Implementando efeito de desfoque usando Canvas
        if (this.isBackgroundBlurred) {
            try {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (!videoTrack) return;
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return;
                
                const videoElement = this.elements.localVideo as HTMLVideoElement;
                
                // Aguardar até que os metadados do vídeo estejam disponíveis
                if (videoElement.videoWidth === 0) {
                    await new Promise<void>((resolve) => {
                        videoElement.addEventListener('loadedmetadata', () => resolve(), { once: true });
                    });
                }
                
                canvas.width = videoElement.videoWidth || 640;
                canvas.height = videoElement.videoHeight || 480;
                
                // Criar stream a partir do canvas
                const canvasStream = canvas.captureStream();
                
                if (canvasStream.getVideoTracks().length === 0) {
                    throw new Error("Não foi possível criar stream a partir do canvas");
                }
                
                // Adicionar o track de áudio original ao novo stream
                this.localStream.getAudioTracks().forEach(track => {
                    canvasStream.addTrack(track);
                });
                
                // Substituir a faixa de vídeo no peer connection
                if (this.peerConnection) {
                    const sender = this.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender && canvasStream.getVideoTracks()[0]) {
                        await sender.replaceTrack(canvasStream.getVideoTracks()[0]);
                    }
                }
                
                // Guardar referência ao stream original
                this.originalStream = this.localStream;
                
                // Atualizar o vídeo local
                if (this.elements.localVideo) {
                    (this.elements.localVideo as HTMLVideoElement).srcObject = canvasStream;
                }
                
                // Aplicar o efeito de desfoque com requestAnimationFrame
                const drawBlurredBackground = () => {
                    if (!this.isBackgroundBlurred) return;
                    
                    try {
                        const width = canvas.width;
                        const height = canvas.height;
                        
                        // Desenhar o vídeo original no canvas com blur
                        ctx.filter = 'blur(12px)';
                        ctx.drawImage(videoElement, 0, 0, width, height);
                        
                        // Uma implementação simples que mantém o centro do vídeo nítido
                        // Em uma aplicação real, você usaria detecção facial para localizar o rosto
                        ctx.filter = 'none';
                        const centerX = width / 2;
                        const centerY = height / 3; // Mais para o topo onde geralmente fica o rosto
                        const radius = Math.min(width, height) / 3;
                        
                        // Salvar o contexto atual
                        ctx.save();
                        
                        // Criar um círculo para a área sem desfoque
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                        ctx.closePath();
                        
                        // Recortar para aplicar apenas dentro do círculo
                        ctx.clip();
                        
                        // Desenhar a parte sem desfoque
                        ctx.drawImage(videoElement, 0, 0, width, height);
                        
                        // Restaurar o contexto
                        ctx.restore();
                        
                        // Continuar o loop de animação
                        requestAnimationFrame(drawBlurredBackground);
                    } catch (e) {
                        console.error("Erro ao desenhar vídeo com desfoque:", e);
                    }
                };
                
                // Iniciar o loop de animação
                requestAnimationFrame(drawBlurredBackground);
                
            } catch (error) {
                console.error("Erro ao aplicar desfoque:", error);
                this.showToast('Erro ao aplicar desfoque de fundo. Seu navegador pode não suportar esta funcionalidade.', 'error');
                this.isBackgroundBlurred = false;
                this.updateButtonStates();
            }
        } else {
            // Restaurar o stream original
            try {
                if (this.originalStream) {
                    await this.replaceMediaStream(this.originalStream, 'video');
                    this.localStream = this.originalStream;
                    this.originalStream = null;
                }
            } catch (error) {
                console.error("Erro ao remover desfoque:", error);
                this.showToast('Erro ao remover desfoque de fundo.', 'error');
            }
        }
    }

    private async toggleScreenSharing(): Promise<void> {
        try {
            if (!this.isScreenSharing) {
                this.screenShareStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });

                if (!this.screenShareStream) {
                    return;
                }

                this.originalStream = this.localStream;
                await this.replaceMediaStream(this.screenShareStream, 'video');
                this.isScreenSharing = true;
                this.updateButtonStates();

                this.screenShareStream.getVideoTracks()[0].onended = () => {
                    this.stopScreenSharing();
                };
            } else {
                this.stopScreenSharing();
            }
        } catch (error) {
            if ((error as DOMException).name === 'NotAllowedError' || (error as DOMException).name === 'NotFoundError') {
                this.showToast('Compartilhamento de tela cancelado.', 'info');
            } else {
                this.showToast('Erro ao (des)ativar compartilhamento de tela.', 'error');
            }
            if (this.isScreenSharing && !this.screenShareStream) {
                this.isScreenSharing = false;
                this.updateButtonStates();
            }
        }
    }

    private stopScreenSharing(): void {
        if (this.screenShareStream) {
            this.screenShareStream.getTracks().forEach(track => {
                track.stop();
            });
            this.screenShareStream = null;
        }

        if (this.originalStream) {
            this.replaceMediaStream(this.originalStream, 'video')
                .then(() => {})
                .catch(() => {});
            this.originalStream = null;
        }

        this.isScreenSharing = false;
        this.updateButtonStates();
    }

    private async replaceMediaStream(newStream: MediaStream, kindToReplace: 'video' | 'audio' | 'both'): Promise<void> {
        if (this.elements.localVideo && (kindToReplace === 'video' || kindToReplace === 'both')) {
            (this.elements.localVideo as HTMLVideoElement).srcObject = newStream;
        }

        if (this.peerConnection) {
            const senders = this.peerConnection.getSenders();

            if (kindToReplace === 'video' || kindToReplace === 'both') {
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                const newVideoTrack = newStream.getVideoTracks()[0];
                if (videoSender) {
                    if (newVideoTrack) {
                        await videoSender.replaceTrack(newVideoTrack);
                    } else {
                        await videoSender.replaceTrack(null);
                    }
                } else if (newVideoTrack) {
                    this.peerConnection.addTrack(newVideoTrack, newStream);
                }
            }

            if (kindToReplace === 'audio' || kindToReplace === 'both') {
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                const newAudioTrack = newStream.getAudioTracks()[0];
                if (audioSender) {
                    if (newAudioTrack) {
                        await audioSender.replaceTrack(newAudioTrack);
                    } else {
                        await audioSender.replaceTrack(null);
                    }
                } else if (newAudioTrack) {
                    this.peerConnection.addTrack(newAudioTrack, newStream);
                }
            }
        }

        if (kindToReplace === 'both' || (kindToReplace === 'video' && !this.isScreenSharing) || (kindToReplace === 'audio' && !this.isScreenSharing)) {
            this.localStream = newStream;
        }
    }

    private toggleChat(): void {
        this.chatVisible = !this.chatVisible;
        this.elements.chatSidebar?.classList.toggle('hidden', !this.chatVisible);

        if (this.chatVisible) {
            this.unreadMessages = 0;
            this.updateUnreadBadge();
        }
    }

    private endCall(): void {
        if (confirm('Deseja realmente encerrar a chamada?')) {
            if (this.dataChannel) {
                this.dataChannel.close();
                this.dataChannel = null;
            }

            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.sendSignalingMessage({ type: 'leave' });
                this.socket.close();
                this.socket = null;
            } else if (this.socket) {
                this.socket = null;
            }

            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
                this.localStream = null;
            }

            if (this.screenShareStream) {
                this.screenShareStream.getTracks().forEach(track => track.stop());
                this.screenShareStream = null;
            }

            this.isInitiator = false;
            this.isConnected = false;
            this.encryptionReady = false;
            this.remoteUser = null;
            this.pendingCandidates = [];
            this.isAudioEnabled = true;
            this.isVideoEnabled = true;
            this.isBackgroundBlurred = false;
            this.isScreenSharing = false;

            this.showLoginScreen();
        }
    }

    private generateRoomId(): string {
        return 'xxxxxx'.replace(/[x]/g, () => (Math.random() * 36 | 0).toString(36)).toUpperCase();
    }

    private generateUserId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    private updateRoomInfo(): void {
        if (this.elements.roomName) this.elements.roomName.textContent = `Sala: ${this.roomId}`;
        if (this.elements.roomCode) this.elements.roomCode.textContent = this.roomId;
        if (this.elements.shareCodeText) this.elements.shareCodeText.textContent = this.roomId;
    }

    private updateRemoteUserInfo(): void {
        if (this.elements.remoteName && this.remoteUser) {
            this.elements.remoteName.textContent = this.remoteUser.name;
        } else if (this.elements.remoteName) {
            this.elements.remoteName.textContent = "Aguardando...";
        }
    }

    private updateConnectionStatus(status: 'connecting' | 'connected' | 'disconnected'): void {
        if (this.elements.connectionIndicator) {
            this.elements.connectionIndicator.classList.remove('connecting', 'connected', 'disconnected');
            this.elements.connectionIndicator.classList.add(status);
            let statusText = 'Conectando...';
            if (status === 'connected') statusText = 'Conectado';
            else if (status === 'disconnected') statusText = 'Desconectado';
            this.elements.connectionIndicator.innerHTML = `<i class="fa-solid fa-circle"></i> ${statusText}`;
        }
    }

    // Atualizar o estado visual dos botões de controle
    private updateButtonStates(): void {
        // Atualiza o botão de microfone
        if (this.elements.toggleMicBtn) {
            this.elements.toggleMicBtn.classList.toggle('active', this.isAudioEnabled);
            this.elements.toggleMicBtn.querySelector('i')?.classList.toggle('fa-microphone', this.isAudioEnabled);
            this.elements.toggleMicBtn.querySelector('i')?.classList.toggle('fa-microphone-slash', !this.isAudioEnabled);
        }
        
        // Atualiza o botão de câmera
        if (this.elements.toggleCameraBtn) {
            this.elements.toggleCameraBtn.classList.toggle('active', this.isVideoEnabled);
            this.elements.toggleCameraBtn.querySelector('i')?.classList.toggle('fa-video', this.isVideoEnabled);
            this.elements.toggleCameraBtn.querySelector('i')?.classList.toggle('fa-video-slash', !this.isVideoEnabled);
        }
        
        // Atualiza o botão de compartilhar tela
        if (this.elements.toggleScreenShareBtn) {
            this.elements.toggleScreenShareBtn.classList.toggle('active', this.isScreenSharing);
        }
        
        // Atualiza o botão de chat
        if (this.elements.toggleChatBtn) {
            this.elements.toggleChatBtn.classList.toggle('active', this.chatVisible);
        }
        
        // Atualiza o botão de desfoque
        if (this.elements.toggleBlurBtn) {
            this.elements.toggleBlurBtn.classList.toggle('active', this.isBackgroundBlurred);
        }
    }

    private copyRoomCode(): void {
        navigator.clipboard.writeText(this.roomId)
            .then(() => {
                this.showToast('Código copiado para a área de transferência!', 'success');
            })
            .catch(() => {
                this.showToast('Falha ao copiar o código.', 'error');
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
        if (this.elements.roomId) (this.elements.roomId as HTMLInputElement).value = '';
        this.adjustUIForWindowSize();
    }

    private showCallScreen(): void {
        this.elements.loginScreen?.classList.add('hidden');
        this.elements.callScreen?.classList.remove('hidden');
        if(this.elements.chatMessages) this.elements.chatMessages.innerHTML = '';
        this.unreadMessages = 0;
        this.updateUnreadBadge();
        this.updateRemoteUserInfo();
        this.adjustUIForWindowSize();
    }

    private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
        if (!this.elements.toastContainer) {
            return;
        }
        const toastElement = document.createElement('div');
        toastElement.className = `toast ${type}`;
        let icon = '';
        switch (type) {
            case 'success': icon = 'fa-circle-check'; break;
            case 'error': icon = 'fa-circle-xmark'; break;
            case 'info': icon = 'fa-circle-info'; break;
            case 'warning': icon = 'fa-triangle-exclamation'; break;
        }
        toastElement.innerHTML = `
            <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="toast-content"><div class="toast-message">${message}</div></div>
        `;
        this.elements.toastContainer.appendChild(toastElement);
        setTimeout(() => {
            toastElement.remove();
        }, 5000);
    }

    private sendSignalingMessage(message: any): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const fullMessage = {
                ...message,
                roomId: this.roomId,
                userId: this.localUser?.id
            };
            this.socket.send(JSON.stringify(fullMessage));
        } else {
            this.showToast("Falha ao enviar dados de sinalização: sem conexão.", "error");
        }
    }
}

// Inicializar o aplicativo quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    const app = new SecureChat();
    (window as any).secureApp = app;
});