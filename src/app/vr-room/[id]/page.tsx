"use client";

import { useEffect, useRef, useState } from "react";
import { Scene } from "@/components/ar/Scene";
import { io, Socket } from "socket.io-client";
import { useParams, useSearchParams } from "next/navigation";

/**
 * VR ROOM PAGE (Mobile)
 * Role: Renders the 3D avatar in SBS stereo mode.
 * This page does NOT run face tracking to save battery and reduce heat.
 * It listens for expression updates from the laptop sensing node.
 */
export default function VRRoomPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const roomId = params.id as string;
    const avatarUrl = searchParams.get("avatar") || "avatar1.glb";
    const pairingId = searchParams.get("pairingId") || "";

    const socketRef = useRef<Socket>();
    const [externalExpressions, setExternalExpressions] = useState<any>(null);
    const [status, setStatus] = useState("Connecting to sensing node...");

    useEffect(() => {
        const socket = io(window.location.origin, {
            path: "/api/socket",
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            setStatus("Connected! Waiting for face data...");
            socket.emit("join-room", roomId, "VR-Headset-Mobile", avatarUrl);
        });

        // Listen for expression updates from the laptop
        socket.on("expression-update", ({ pairingId: incomingId, expressions }) => {
            if (incomingId === pairingId) {
                setExternalExpressions(expressions);
                if (status !== "Receiving live data") {
                    setStatus("Receiving live data");
                }
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [roomId, avatarUrl, status]);

    return (
        <div className="relative h-screen w-screen bg-black overflow-hidden">
            {/* The 3D Scene in forced Stereo (SBS) mode */}
            <Scene
                className="w-full h-full"
                avatarUrl={avatarUrl}
                isStereo={true}
                externalExpressions={externalExpressions}
            />

            {/* Overlay for status (will be visible in both eyes if centered, but kept minimal) */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10 z-50 pointer-events-none">
                <p className="text-[10px] text-white/70 font-mono text-center">
                    {status} | Room: {roomId} | ID: {pairingId}
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
