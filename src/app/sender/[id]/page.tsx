"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { io, Socket } from "socket.io-client";
import { useParams, useSearchParams } from "next/navigation";
import SimplePeer from "simple-peer";

/**
 * SENDER PAGE (Laptop)
 * Role: Captures face tracking data and sends it to the VR headset.
 * Now also sends the VIDEO FEED via WebRTC for remote tracking/display.
 */
export default function SenderPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const roomId = params.id as string;
    const pairingId = searchParams.get("pairingId") || "";
    const { videoRef, faceResultRef, stream } = useFaceTracking();
    const socketRef = useRef<Socket>();
    const [status, setStatus] = useState("Initializing...");
    const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());

    const createPeer = (userToSignal: string, socket: Socket, stream: MediaStream) => {
        console.log("Sender: Creating peer for:", userToSignal);
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
            console.log("Sender: Sending signal to:", userToSignal);
            socket.emit("offer", { target: userToSignal, signal, callerName: "Face-Sensing-Laptop", callerAvatar: "none" });
        });

        peer.on("connect", () => console.log("Sender: Peer connected!"));
        peer.on("error", (err) => console.error("Sender Peer error:", err));

        peersRef.current.set(userToSignal, peer);
    };

    const addPeer = (incomingSignal: any, callerId: string, socket: Socket, stream: MediaStream) => {
        console.log("Sender: Adding peer for:", callerId);
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
                console.log("Sender: Sending signal (answer) to:", callerId);
                socket.emit("answer", { target: callerId, signal, senderName: "Face-Sensing-Laptop", senderAvatar: "none" });
            });

            peer.on("connect", () => console.log("Sender: Peer connected!"));
            peer.on("error", (err) => console.error("Sender Peer error:", err));

            peersRef.current.set(callerId, peer);
        }

        peer.signal(incomingSignal);
    };

    useEffect(() => {
        const socket = io(window.location.origin, {
            path: "/api/socket",
            transports: ["websocket"],
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            setStatus("Connected! Waiting for paired VR device...");
            socket.emit("join-room", roomId, "Face-Sensing-Laptop", "none", pairingId);
        });

        socket.on("vr-user-connected", ({ userId }) => {
            if (stream) {
                setStatus("Paired VR Device detected. Connecting...");
                createPeer(userId, socket, stream);
            }
        });

        socket.on("offer", ({ signal, callerId, callerName }) => {
            // Only accept offers from VR-User (the paired device)
            if (callerName === "VR-User" && stream) {
                setStatus("Paired VR Device requested connection. Connecting...");
                addPeer(signal, callerId, socket, stream);
            }
        });

        socket.on("answer", ({ signal, senderId }) => {
            setStatus("Connected to Paired VR Device!");
            const peer = peersRef.current.get(senderId);
            if (peer) peer.signal(signal);
        });

        socket.on("user-disconnected", (userId) => {
            if (peersRef.current.has(userId)) {
                peersRef.current.get(userId)?.destroy();
                peersRef.current.delete(userId);
                setStatus("Paired VR Device disconnected.");
            }
        });

        // Loop to send data at ~60 FPS for smoother transitions
        const interval = setInterval(() => {
            if (faceResultRef.current && faceResultRef.current.faceBlendshapes?.length > 0) {
                const blendshapes = faceResultRef.current.faceBlendshapes[0].categories;
                const rotation = faceResultRef.current.facialTransformationMatrixes?.[0]?.data;

                const activeBlendshapes = blendshapes.reduce((acc: any, cat) => {
                    if (cat.score > 0.01) {
                        acc[cat.categoryName] = parseFloat(cat.score.toFixed(3));
                    }
                    return acc;
                }, {});

                const expressions = {
                    blendshapes: activeBlendshapes,
                    rotation: rotation ? Array.from(rotation).map(v => parseFloat(v.toFixed(4))) : null
                };

                socket.emit("expression-update", { roomId, pairingId, expressions });
            }
        }, 10);

        return () => {
            clearInterval(interval);
            socket.disconnect();
            peersRef.current.forEach(p => p.destroy());
            peersRef.current.clear();
        };
    }, [roomId, stream]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-8">
            <div className="max-w-md w-full space-y-6 text-center">
                <h1 className="text-3xl font-bold text-blue-400">Face Sensing Node</h1>
                <p className="text-zinc-400 italic">Laptop Mode: Sending tracking data & video to VR</p>

                <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-blue-500/30 bg-black">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover mirror"
                    />
                    <div className="absolute top-4 left-4 px-3 py-1 bg-blue-600 rounded-full text-xs font-bold animate-pulse">
                        LIVE TRACKING & STREAMING
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                    <p className="text-sm font-mono">{status}</p>
                    <p className="text-xs text-zinc-500 mt-2">Room: {roomId} | Pairing ID: {pairingId}</p>
                </div>

                <div className="text-left space-y-2 text-sm text-zinc-400">
                    <p>✅ Webcam Active</p>
                    <p>✅ MediaPipe Face Mesh Running</p>
                    <p>✅ WebRTC Video Stream Active</p>
                    <p>✅ Socket.io Broadcasting</p>
                </div>
            </div>
        </div>
    );
}

