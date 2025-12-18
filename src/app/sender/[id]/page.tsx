"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { io, Socket } from "socket.io-client";
import { useParams, useSearchParams } from "next/navigation";

/**
 * SENDER PAGE (Laptop)
 * Role: Captures face tracking data and sends it to the VR headset.
 * This page does NOT render the 3D avatar to save processing power.
 */
export default function SenderPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const roomId = params.id as string;
    const pairingId = searchParams.get("pairingId") || "";
    const { videoRef, faceResultRef } = useFaceTracking();
    const socketRef = useRef<Socket>();
    const [status, setStatus] = useState("Initializing...");

    useEffect(() => {
        const socket = io(window.location.origin, {
            path: "/api/socket",
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            setStatus("Connected! Tracking face...");
            socket.emit("join-room", roomId, "Face-Sensing-Laptop", "none");
        });

        // Loop to send data at ~60 FPS for smoother transitions
        const interval = setInterval(() => {
            if (faceResultRef.current && faceResultRef.current.faceBlendshapes?.length > 0) {
                const blendshapes = faceResultRef.current.faceBlendshapes[0].categories;
                const rotation = faceResultRef.current.facialTransformationMatrixes?.[0]?.data;

                // Optimization: Only send blendshapes with a score > 0.01 to reduce payload size
                // and focus on the most active expressions.
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
        }, 16); // 16ms = ~60 FPS

        return () => {
            clearInterval(interval);
            socket.disconnect();
        };
    }, [roomId]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-8">
            <div className="max-w-md w-full space-y-6 text-center">
                <h1 className="text-3xl font-bold text-blue-400">Face Sensing Node</h1>
                <p className="text-zinc-400 italic">Laptop Mode: Sending tracking data to VR</p>

                <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-blue-500/30 bg-black">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover mirror"
                    />
                    <div className="absolute top-4 left-4 px-3 py-1 bg-blue-600 rounded-full text-xs font-bold animate-pulse">
                        LIVE TRACKING
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                    <p className="text-sm font-mono">{status}</p>
                    <p className="text-xs text-zinc-500 mt-2">Room: {roomId} | Pairing ID: {pairingId}</p>
                </div>

                <div className="text-left space-y-2 text-sm text-zinc-400">
                    <p>✅ Webcam Active</p>
                    <p>✅ MediaPipe Face Mesh Running</p>
                    <p>✅ Socket.io Broadcasting</p>
                </div>
            </div>
        </div>
    );
}
