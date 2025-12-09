import SimplePeer from 'simple-peer';
import { io, Socket } from 'socket.io-client';

export class WebRTCManager {
    socket: Socket;
    peer: SimplePeer.Instance | null = null;
    localStream: MediaStream | null = null;
    onRemoteStream: (stream: MediaStream) => void;
    roomId: string;

    constructor(roomId: string, onRemoteStream: (stream: MediaStream) => void) {
        this.roomId = roomId;
        this.onRemoteStream = onRemoteStream;
        // Connect to signaling server (we'll need to implement this)
        // For MVP, we assume the server is at the same origin or a specific URL
        this.socket = io({ path: '/api/socket' });

        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            console.log('Connected to signaling server');
            this.socket.emit('join-room', this.roomId);
        });

        this.socket.on('user-connected', (userId: string) => {
            console.log('User connected:', userId);
            this.createPeer(userId, true); // Initiator
        });

        this.socket.on('offer', (data: any) => {
            this.handleOffer(data);
        });

        this.socket.on('answer', (data: any) => {
            this.handleAnswer(data);
        });

        this.socket.on('ice-candidate', (data: any) => {
            this.handleCandidate(data);
        });
    }

    createPeer(userId: string, initiator: boolean) {
        this.peer = new SimplePeer({
            initiator,
            trickle: false,
            stream: this.localStream || undefined,
        });

        this.peer.on('signal', (data) => {
            if (initiator) {
                this.socket.emit('offer', { target: userId, signal: data });
            } else {
                this.socket.emit('answer', { target: userId, signal: data });
            }
        });

        this.peer.on('stream', (stream) => {
            this.onRemoteStream(stream);
        });
    }

    // ... (Simplified for MVP, full implementation needs proper signaling handling for offer/answer exchange)
    // Since SimplePeer handles the handshake if we pass the signal, we need to adapt the socket events to pass 'signal' data into peer.signal()

    handleOffer(data: { sender: string, signal: any }) {
        if (!this.peer) {
            this.peer = new SimplePeer({ initiator: false, trickle: false, stream: this.localStream || undefined });
            this.peer.on('signal', (signal) => {
                this.socket.emit('answer', { target: data.sender, signal });
            });
            this.peer.on('stream', (stream) => {
                this.onRemoteStream(stream);
            });
        }
        this.peer.signal(data.signal);
    }

    handleAnswer(data: { sender: string, signal: any }) {
        this.peer?.signal(data.signal);
    }

    handleCandidate(data: { sender: string, candidate: any }) {
        // SimplePeer handles candidates in the signal data usually if trickle is false.
        // If trickle is true, we'd call peer.addIceCandidate
        this.peer?.signal(data.candidate);
    }

    setLocalStream(stream: MediaStream) {
        this.localStream = stream;
        if (this.peer) {
            this.peer.addStream(stream);
        }
    }

    destroy() {
        this.peer?.destroy();
        this.socket.disconnect();
    }
}
