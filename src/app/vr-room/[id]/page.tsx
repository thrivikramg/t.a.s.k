"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from 'next/dynamic';
const Scene = dynamic(() => import('@/components/ar/Scene').then(mod => mod.Scene), { ssr: false });
import { io, Socket } from "socket.io-client";
import { useParams, useSearchParams } from "next/navigation";
import SimplePeer from "simple-peer";
import { useFaceTracking } from "@/hooks/useFaceTracking";

/**
 * VR ROOM PAGE (Mobile)
 * Role: Renders the 3D avatar in SBS stereo mode.
 * Now receives the laptop's webcam feed and runs tracking locally for better responsiveness.
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
    const [laptopStream, setLaptopStream] = useState<MediaStream | null>(null);
    const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
    const canvasContainerRef = useRef<HTMLDivElement>(null);

    // Local tracking on the received laptop stream
    const { faceResultRef, handResultRef } = useFaceTracking({
        enabled: !!laptopStream,
        externalStream: laptopStream
    });

    // Helper to capture the 3D canvas stream
    const getCanvasStream = () => {
        const canvas = canvasContainerRef.current?.querySelector("canvas");
        if (!canvas) {
            console.error("Canvas not found for stream capture");
            return null;
        }
        const stream = (canvas as any).captureStream(30) as MediaStream;
        return stream;
    };

    const createPeer = (userToSignal: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) return;

        console.log("VRRoomPage: Creating peer for:", userToSignal);

        const peer = new SimplePeer({
            initiator: true,
            trickle: true,
            stream: stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        peer.on("signal", (signal) => {
            console.log("VRRoomPage: Sending signal (offer) to:", userToSignal);
            socket.emit("offer", { target: userToSignal, signal, callerName: "VR-User", callerAvatar: avatarUrl });
        });

        peer.on("stream", (stream) => {
            console.log("VRRoomPage: Received stream from:", remoteName);
            if (remoteName === "Face-Sensing-Laptop") {
                setLaptopStream(stream);
            } else {
                setPeers((prev) => {
                    if (prev.find(p => p.peerId === userToSignal)) return prev;
                    return [...prev, { peerId: userToSignal, userName: remoteName, avatar: remoteAvatar, stream }];
                });
            }
        });

        peer.on("connect", () => console.log("VRRoomPage: Peer connected to:", remoteName));
        peer.on("error", (err) => console.error("VRRoomPage: Peer error (createPeer):", err));

        peer.on("data", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'tracking-data') {
                    setPeers((prev) => prev.map(p => {
                        if (p.peerId === userToSignal) {
                            return { ...p, trackingData: msg.trackingData };
                        }
                        return p;
                    }));
                }
            } catch (e) {
                console.error("Error parsing peer data:", e);
            }
        });

        peersRef.current.set(userToSignal, peer);
    };

    const addPeer = (incomingSignal: any, callerId: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) return;

        console.log("VRRoomPage: Adding peer for:", callerId);
        let peer = peersRef.current.get(callerId);

        if (!peer) {
            peer = new SimplePeer({
                initiator: false,
                trickle: true,
                stream: stream,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            peer.on("signal", (signal) => {
                console.log("VRRoomPage: Sending signal (answer) to:", callerId);
                socket.emit("answer", { target: callerId, signal, senderName: "VR-User", senderAvatar: avatarUrl });
            });

            peer.on("stream", (stream) => {
                console.log("VRRoomPage: Received stream from:", remoteName);
                if (remoteName === "Face-Sensing-Laptop") {
                    setLaptopStream(stream);
                } else {
                    setPeers((prev) => {
                        if (prev.find(p => p.peerId === callerId)) return prev;
                        return [...prev, { peerId: callerId, userName: remoteName, avatar: remoteAvatar, stream }];
                    });
                }
            });

            peer.on("connect", () => console.log("VRRoomPage: Peer connected to:", remoteName));
            peer.on("error", (err) => console.error("VRRoomPage: Peer error (addPeer):", err));

            peer.on("data", (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'tracking-data') {
                        setPeers((prev) => prev.map(p => {
                            if (p.peerId === callerId) {
                                return { ...p, trackingData: msg.trackingData };
                            }
                            return p;
                        }));
                    }
                } catch (e) {
                    console.error("Error parsing peer data:", e);
                }
            });

            peersRef.current.set(callerId, peer);
        }

        peer.signal(incomingSignal);
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
                setStatus("Connected to server. Waiting for laptop...");
                socket!.emit("join-room", roomId, "VR-User", avatarUrl, pairingId);
            });

            socket.on("sensing-node-connected", ({ userId }) => {
                setStatus("Paired Laptop detected. Connecting feed...");
                createPeer(userId, socket!, "Face-Sensing-Laptop", "none");
            });

            socket.on("expression-update", ({ pairingId: incomingId, expressions }) => {
                if (incomingId === pairingId) {
                    setExternalExpressions(expressions);
                    setStatus("Receiving tracking data...");

                    // Relay to other peers
                    const trackingMsg = JSON.stringify({
                        type: 'tracking-data',
                        trackingData: expressions
                    });
                    peersRef.current.forEach(peer => {
                        if (peer.connected) {
                            try {
                                peer.send(trackingMsg);
                            } catch (e) {
                                // Ignore send errors
                            }
                        }
                    });
                }
            });

            socket.on("user-connected", ({ userId, userName, avatar }) => {
                console.log("User connected:", userId, userName);
                // Ignore the laptop here, it's handled by sensing-node-connected
                if (userName === "Face-Sensing-Laptop") return;

                setStatus(`New participant: ${userName}. Connecting...`);
                createPeer(userId, socket!, userName, avatar);
            });

            socket.on("user-disconnected", (userId) => {
                if (peersRef.current.has(userId)) {
                    peersRef.current.get(userId)?.destroy();
                    peersRef.current.delete(userId);
                }
                setPeers((prev) => prev.filter((p) => p.peerId !== userId));
                setStatus("User disconnected.");
            });

            socket.on("offer", ({ signal, callerId, callerName, callerAvatar }) => {
                setStatus(`Receiving connection from ${callerName}...`);
                addPeer(signal, callerId, socket!, callerName, callerAvatar);
            });

            socket.on("answer", ({ signal, senderId }) => {
                setStatus("Connection established!");
                const item = peersRef.current.get(senderId);
                if (item) item.signal(signal);
            });
        };

        checkCanvasInterval = setInterval(() => {
            if (canvasContainerRef.current?.querySelector("canvas")) {
                clearInterval(checkCanvasInterval);
                setStatus("Canvas ready. Connecting...");
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

    useEffect(() => {
        if (laptopStream) {
            setStatus("Live (Video Feed)");
        }
    }, [laptopStream]);

    return (
        <div className="relative h-screen w-screen bg-black overflow-hidden" ref={canvasContainerRef}>
            {/* The 3D Scene in forced Stereo (SBS) mode */}
            <Scene
                className="w-full h-full"
                avatarUrl={avatarUrl}
                isStereo={true}
                faceResultRef={faceResultRef}
                handResultRef={handResultRef}
                externalExpressions={externalExpressions}
                peers={peers}
            />

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

