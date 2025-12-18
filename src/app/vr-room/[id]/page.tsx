"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from 'next/dynamic';
const Scene = dynamic(() => import('@/components/ar/Scene').then(mod => mod.Scene), { ssr: false });
import { io, Socket } from "socket.io-client";
import { useParams, useSearchParams } from "next/navigation";
import SimplePeer from "simple-peer";

/**
 * VR ROOM PAGE (Mobile)
 * Role: Renders the 3D avatar in SBS stereo mode.
 * Now also connects via WebRTC to display other users in the room.
 */
export default function VRRoomPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const roomId = params.id as string;
    const avatarUrl = searchParams.get("avatar") || "avatar1.glb";
    const pairingId = searchParams.get("pairingId") || "";

    const socketRef = useRef<Socket>();
    const [externalExpressions, setExternalExpressions] = useState<any>(null);
    const [status, setStatus] = useState("Connecting...");

    // WebRTC State
    const [peers, setPeers] = useState<{ peerId: string; userName: string; avatar?: string; stream: MediaStream }[]>([]);
    const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    // Helper to capture the 3D canvas stream
    const getCanvasStream = () => {
        const canvas = canvasContainerRef.current?.querySelector("canvas");
        if (!canvas) {
            console.error("Canvas not found for stream capture");
            return null;
        }
        // Capture at 60 FPS
        const stream = (canvas as any).captureStream(30) as MediaStream;
        return stream;
    };

    const createPeer = (userToSignal: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) {
            console.error("No stream available for createPeer in VRRoomPage");
            return;
        }

        console.log("VRRoomPage: Creating peer for:", userToSignal);

        const peer = new SimplePeer({
            initiator: true,
            trickle: false,
            stream: stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on("signal", (signal) => {
            console.log("VRRoomPage: Sending offer to:", userToSignal);
            socket.emit("offer", { target: userToSignal, signal, callerName: "VR-User", callerAvatar: avatarUrl });
        });

        peer.on("stream", (stream) => {
            console.log("VRRoomPage: Received stream from:", userToSignal);
            setPeers((prev) => [...prev, { peerId: userToSignal, userName: remoteName, avatar: remoteAvatar, stream }]);
        });

        peer.on("error", (err) => {
            console.error("VRRoomPage: Peer error (createPeer):", err);
        });

        peersRef.current.set(userToSignal, peer);
    };

    const addPeer = (incomingSignal: any, callerId: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) {
            console.error("No stream available for addPeer in VRRoomPage");
            return;
        }

        console.log("VRRoomPage: Adding peer for:", callerId);

        const peer = new SimplePeer({
            initiator: false,
            trickle: false,
            stream: stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on("signal", (signal) => {
            console.log("VRRoomPage: Sending answer to:", callerId);
            socket.emit("answer", { target: callerId, signal, senderName: "VR-User", senderAvatar: avatarUrl });
        });

        peer.on("stream", (stream) => {
            console.log("VRRoomPage: Received stream from:", callerId);
            setPeers((prev) => [...prev, { peerId: callerId, userName: remoteName, avatar: remoteAvatar, stream }]);
        });

        peer.on("error", (err) => {
            console.error("VRRoomPage: Peer error (addPeer):", err);
        });

        peer.signal(incomingSignal);
        peersRef.current.set(callerId, peer);
    };

    useEffect(() => {
        let socket: Socket | undefined;
        let checkCanvasInterval: NodeJS.Timeout;

        const connectSocket = () => {
            socket = io(window.location.origin, {
                path: "/api/socket",
                transports: ["websocket"],
            });
            socketRef.current = socket;

            socket.on("connect", () => {
                setStatus("Connected! Waiting for data...");
                socket!.emit("join-room", roomId, "VR-User", avatarUrl);
            });

            // Expression updates from Laptop
            socket.on("expression-update", ({ pairingId: incomingId, expressions }) => {
                if (incomingId === pairingId) {
                    setExternalExpressions(expressions);
                    setStatus("Live");
                }
            });

            // WebRTC: User Connected
            socket.on("user-connected", ({ userId, userName, avatar }) => {
                console.log("User connected:", userId, userName);
                // Ignore the sensing laptop
                if (userName === "Face-Sensing-Laptop") return;
                createPeer(userId, socket!, userName, avatar);
            });

            // WebRTC: User Disconnected
            socket.on("user-disconnected", (userId) => {
                if (peersRef.current.has(userId)) {
                    peersRef.current.get(userId)?.destroy();
                    peersRef.current.delete(userId);
                }
                setPeers((prev) => prev.filter((p) => p.peerId !== userId));
            });

            // WebRTC: Offer
            socket.on("offer", ({ signal, callerId, callerName, callerAvatar }) => {
                if (callerName === "Face-Sensing-Laptop") return;
                addPeer(signal, callerId, socket!, callerName, callerAvatar);
            });

            // WebRTC: Answer
            socket.on("answer", ({ signal, senderId }) => {
                const item = peersRef.current.get(senderId);
                if (item) item.signal(signal);
            });
        };

        // Wait for canvas to be ready
        checkCanvasInterval = setInterval(() => {
            if (canvasContainerRef.current?.querySelector("canvas")) {
                clearInterval(checkCanvasInterval);
                connectSocket();
            }
        }, 500);

        return () => {
            clearInterval(checkCanvasInterval);
            socket?.disconnect();
            peersRef.current.forEach((p) => p.destroy());
            peersRef.current.clear();
        };
    }, [roomId, avatarUrl, pairingId]);

    return (
        <div className="relative h-screen w-screen bg-black overflow-hidden" ref={canvasContainerRef}>
            {/* The 3D Scene in forced Stereo (SBS) mode */}
            <Scene
                className="w-full h-full"
                avatarUrl={avatarUrl}
                isStereo={true}
                externalExpressions={externalExpressions}
                peers={peers}
            />

            {/* Overlay for status */}
            {/* Overlay for status */}
            <div className="absolute bottom-0 left-0 w-full p-2 bg-black/80 backdrop-blur-md border-t border-white/10 z-50">
                <p className="text-[10px] text-white/70 font-mono text-center">
                    {status} | Room: {roomId} | Peers: {peers.length}
                </p>
            </div>

            {/* Exit Button (Top Right) */}
            <button
                onClick={() => window.history.back()}
                className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white z-50 backdrop-blur-md"
            >
                ✕
            </button>
        </div>
    );
}
