"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { FaceLandmarkerResult, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import dynamic from 'next/dynamic';
const Scene = dynamic(() => import('@/components/ar/Scene').then(mod => mod.Scene), { ssr: false });
import { io, Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import { useRouter } from "next/navigation";

interface VideoRoomProps {
    roomId: string;
    avatar?: string;
}

export default function VideoRoom({ roomId, avatar }: VideoRoomProps) {
    // 1. State for Device Role
    const [deviceRole, setDeviceRole] = useState<'sender' | 'receiver' | null>(null);

    // 2. Face Tracking Hook - Only enabled if role is 'sender'
    const { videoRef, faceResultRef, handResultRef, stream } = useFaceTracking({ enabled: deviceRole === 'sender' });

    const [peers, setPeers] = useState<{ peerId: string; userName: string; avatar?: string; stream: MediaStream }[]>([]);
    const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
    const socketRef = useRef<Socket>();
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const [showWebcam, setShowWebcam] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const [isStereo, setIsStereo] = useState(false);
    const [pairingId, setPairingId] = useState("");
    const router = useRouter();

    // Remote tracking data from paired device
    const [remoteTrackingData, setRemoteTrackingData] = useState<{
        blendshapes: Record<string, number>;
        rotation: number[] | null;
        handResult?: HandLandmarkerResult | null;
    } | undefined>(undefined);

    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    // Join state
    const [hasJoined, setHasJoined] = useState(false);
    const [userName, setUserName] = useState("");

    // Webcam position
    const [webcamPos, setWebcamPos] = useState({ x: 20, y: 20 });
    const draggingRef = useRef(false);
    const offsetRef = useRef({ x: 0, y: 0 });

    /** ------------------------ SOCKET ------------------------ **/
    useEffect(() => {
        if (!hasJoined) return;

        let socket: Socket | undefined;
        let checkCanvasInterval: NodeJS.Timeout;

        const connectSocket = () => {
            const url = window.location.origin;
            console.log("Initializing socket connection to:", url, "with path: /api/socket");
            socket = io(url, {
                path: "/api/socket",
                reconnectionAttempts: 5,
                timeout: 10000,
                transports: ["websocket"],
            });
            socketRef.current = socket;

            socket.on("connect", () => {
                console.log("Socket connected:", socket?.id);
            });

            socket.on("connect_error", (err) => {
                console.error("Socket connection error:", err);
            });

            socket.emit("join-room", roomId, userName, avatar);

            socket.on("user-connected", ({ userId, userName: remoteName, avatar: remoteAvatar }) => {
                console.log("User connected:", userId, remoteName, remoteAvatar);
                createPeer(userId, socket!.id!, socket!, remoteName, remoteAvatar);
            });

            socket.on("user-disconnected", (userId) => {
                console.log("User disconnected:", userId);
                if (peersRef.current.has(userId)) {
                    peersRef.current.get(userId)?.destroy();
                    peersRef.current.delete(userId);
                }
                setPeers((prev) => prev.filter((p) => p.peerId !== userId));
            });

            socket.on("offer", ({ signal, callerId, callerName, callerAvatar }) => {
                console.log("Received offer from:", callerId, callerName);
                addPeer(signal, callerId, socket!, callerName, callerAvatar);
            });

            socket.on("answer", ({ signal, senderId, senderName, senderAvatar }) => {
                console.log("Received answer from:", senderId, senderName);
                const item = peersRef.current.get(senderId);
                if (item) {
                    item.signal(signal);
                }
            });
        };

        // Wait for canvas to be ready before connecting
        checkCanvasInterval = setInterval(() => {
            const canvas = canvasContainerRef.current?.querySelector("canvas");
            if (canvas) {
                console.log("Canvas found, connecting...");
                clearInterval(checkCanvasInterval);
                connectSocket();
            } else {
                console.log("Waiting for canvas...");
            }
        }, 500);

        return () => {
            clearInterval(checkCanvasInterval);
            socket?.disconnect();
            peersRef.current.forEach((p) => p.destroy());
            peersRef.current.clear();
        };
    }, [roomId, hasJoined, userName, avatar]);

    /** ------------------------ DATA CHANNEL (TRACKING) ------------------------ **/
    // Send tracking data if we have a pairing ID (Sender Mode)
    useEffect(() => {
        if (!hasJoined || !pairingId || deviceRole !== 'sender') return;

        const interval = setInterval(() => {
            if (faceResultRef.current && faceResultRef.current.faceBlendshapes && faceResultRef.current.faceBlendshapes.length > 0) {
                const blendshapes = faceResultRef.current.faceBlendshapes[0].categories.reduce((acc, category) => {
                    acc[category.categoryName] = category.score;
                    return acc;
                }, {} as Record<string, number>);

                const matrix = faceResultRef.current.facialTransformationMatrixes?.[0]?.data;

                const data = {
                    type: 'tracking-data',
                    pairingId,
                    blendshapes,
                    rotation: matrix ? Array.from(matrix) : null,
                    handResult: handResultRef.current // Send hand data too
                };

                const json = JSON.stringify(data);
                peersRef.current.forEach((peer) => {
                    if (peer.connected) {
                        try {
                            peer.send(json);
                        } catch (e) {
                            console.error("Error sending data:", e);
                        }
                    }
                });
            }
        }, 33); // ~30fps

        return () => clearInterval(interval);
    }, [hasJoined, pairingId, deviceRole]);

    /** ------------------------ WEBRTC ------------------------ **/
    const getCanvasStream = () => {
        const canvas = canvasContainerRef.current?.querySelector("canvas");
        if (!canvas) {
            console.error("Canvas not found for stream capture");
            return null;
        }

        // Cast to any because captureStream might not be in the TS definition
        const stream = (canvas as any).captureStream(30) as MediaStream;

        // Only add audio track if we are the sender (have a webcam stream)
        if (streamRef.current && deviceRole === 'sender') {
            const audioTracks = streamRef.current.getAudioTracks();
            if (audioTracks.length > 0) {
                stream.addTrack(audioTracks[0]);
            } else {
                console.warn("No audio tracks found in webcam stream");
            }
        }
        return stream;
    };

    const createPeer = (userToSignal: string, callerId: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) {
            console.error("No stream available for createPeer");
            return;
        }

        console.log("Creating peer for:", userToSignal);

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
            console.log("Sending offer to:", userToSignal);
            socket.emit("offer", { target: userToSignal, signal, callerName: userName, callerAvatar: avatar });
        });

        peer.on("stream", (stream) => {
            console.log("Received stream from:", userToSignal);
            setPeers((prev) => [...prev, { peerId: userToSignal, userName: remoteName, avatar: remoteAvatar, stream }]);
        });

        peer.on("error", (err) => {
            console.error("Peer error (createPeer):", err);
        });

        peer.on("data", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'tracking-data' && msg.pairingId === pairingId) {
                    // We received tracking data from our paired device!
                    setRemoteTrackingData({
                        blendshapes: msg.blendshapes,
                        rotation: msg.rotation,
                        handResult: msg.handResult
                    });
                }
            } catch (e) {
                console.error("Error parsing data:", e);
            }
        });

        peersRef.current.set(userToSignal, peer);
    };

    const addPeer = (incomingSignal: any, callerId: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) {
            console.error("No stream available for addPeer");
            return;
        }

        console.log("Adding peer for:", callerId);

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
            console.log("Sending answer to:", callerId);
            socket.emit("answer", { target: callerId, signal, senderName: userName, senderAvatar: avatar });
        });

        peer.on("stream", (stream) => {
            console.log("Received stream from:", callerId);
            setPeers((prev) => [...prev, { peerId: callerId, userName: remoteName, avatar: remoteAvatar, stream }]);
        });

        peer.on("error", (err) => {
            console.error("Peer error (addPeer):", err);
        });

        peer.signal(incomingSignal);

        peer.on("data", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'tracking-data' && msg.pairingId === pairingId) {
                    // We received tracking data from our paired device!
                    setRemoteTrackingData({
                        blendshapes: msg.blendshapes,
                        rotation: msg.rotation,
                        handResult: msg.handResult
                    });
                }
            } catch (e) {
                console.error("Error parsing data:", e);
            }
        });

        peersRef.current.set(callerId, peer);
    };

    /** ------------------------ DRAG HANDLERS ------------------------ **/
    const onMouseDown = (e: React.MouseEvent<HTMLVideoElement>) => {
        draggingRef.current = true;
        if (videoRef.current) {
            const rect = videoRef.current.getBoundingClientRect();
            offsetRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            };
        }
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current) return;
        setWebcamPos({
            x: e.clientX - offsetRef.current.x,
            y: e.clientY - offsetRef.current.y,
        });
    };

    const onMouseUp = () => {
        draggingRef.current = false;
    };

    useEffect(() => {
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    if (!hasJoined) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 text-white p-4">
                <h1 className="text-3xl font-bold mb-8">Join Room</h1>
                <div className="bg-black/50 p-8 rounded-2xl border border-white/10 shadow-2xl w-full max-w-md space-y-6">

                    {/* Name Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Enter your name</label>
                        <input
                            type="text"
                            value={userName}
                            onChange={(e) => setUserName(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Your Name"
                        />
                    </div>

                    {/* Pairing ID Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Pairing ID (Optional)</label>
                        <input
                            type="text"
                            value={pairingId}
                            onChange={(e) => setPairingId(e.target.value)}
                            className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                            placeholder="e.g. 1234"
                        />
                        <p className="text-xs text-zinc-500 mt-1">Use the same ID on both devices to link them.</p>
                    </div>

                    {/* Role Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setDeviceRole('sender')}
                            className={`p-4 rounded-xl border transition-all text-left ${deviceRole === 'sender' ? 'bg-blue-600/20 border-blue-500 ring-1 ring-blue-500' : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'}`}
                        >
                            <div className="text-2xl mb-2">💻</div>
                            <div className="font-bold text-sm">Laptop</div>
                            <div className="text-xs text-zinc-400">Sender (Webcam)</div>
                        </button>

                        <button
                            onClick={() => setDeviceRole('receiver')}
                            className={`p-4 rounded-xl border transition-all text-left ${deviceRole === 'receiver' ? 'bg-purple-600/20 border-purple-500 ring-1 ring-purple-500' : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'}`}
                        >
                            <div className="text-2xl mb-2">📱</div>
                            <div className="font-bold text-sm">Mobile</div>
                            <div className="text-xs text-zinc-400">Receiver (VR)</div>
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            if (userName.trim() && deviceRole) {
                                setHasJoined(true);
                                if (deviceRole === 'receiver') {
                                    setIsStereo(true); // Auto-enter VR mode for receiver
                                } else {
                                    setShowWebcam(true); // Auto-show webcam for sender
                                }
                            }
                        }}
                        disabled={!userName.trim() || !deviceRole}
                        className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                        Join Call
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-screen w-screen bg-zinc-900 overflow-hidden flex flex-col">
            {/* Fullscreen Local Avatar (Background) */}
            <div
                ref={canvasContainerRef}
                className="absolute inset-0 z-0"
            >
                <Scene
                    faceResultRef={faceResultRef}
                    handResultRef={handResultRef}
                    className="w-full h-full"
                    avatarUrl={avatar}
                    peers={peers}
                    isStereo={isStereo}
                    userName={userName}
                    externalExpressions={remoteTrackingData} // Pass remote data if available
                />
                {!isStereo && (
                    <div className="absolute bottom-8 left-8 px-4 py-2 bg-black/50 rounded-lg text-sm text-white/80 font-medium backdrop-blur-sm">
                        {userName} (You)
                    </div>
                )}
            </div>

            {/* Peers Grid Overlay - Hidden in Stereo Mode */}
            <div className={`absolute inset-0 z-10 p-4 pointer-events-none ${isStereo ? 'hidden' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto content-start'}`}>
                {/* Remote Peers */}
                {peers.map((peer) => (
                    <div key={peer.peerId} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/10 shadow-lg pointer-events-auto">
                        <video
                            ref={(ref) => {
                                if (ref) {
                                    ref.srcObject = peer.stream;
                                }
                            }}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 rounded text-[10px] text-white/80 font-medium backdrop-blur-sm">
                            {peer.userName || `User ${peer.peerId.slice(0, 4)}`}
                            {peer.avatar && <span className="text-white/50 ml-1">({peer.avatar.replace(".glb", "")})</span>}
                        </div>
                    </div>
                ))}

                {/* Placeholder if alone (optional) */}
                {peers.length === 0 && (
                    <div className="hidden md:flex items-center justify-center rounded-xl border border-dashed border-white/10 text-white/20 font-light tracking-widest uppercase text-xs aspect-video pointer-events-auto">
                        Waiting for peers...
                    </div>
                )}
            </div>

            {/* Draggable Webcam - Only show if sender */}
            {deviceRole === 'sender' && (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onMouseDown={onMouseDown}
                    className="absolute cursor-grab rounded-lg border border-white/20 shadow-lg z-0 object-cover"
                    style={{
                        position: 'absolute',
                        left: showWebcam && !isStereo ? webcamPos.x : -9999,
                        top: showWebcam && !isStereo ? webcamPos.y : -9999,
                        opacity: showWebcam && !isStereo ? 1 : 0, // Double insurance
                        width: '120px',
                        height: '90px',
                        zIndex: 0,
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        cursor: 'grab',
                        objectFit: 'cover'
                    }}
                />
            )}

            {/* Controls - Visible in both modes */}
            <div className="absolute bottom-12 w-full flex items-center justify-center gap-4 z-20">
                {deviceRole === 'sender' && (
                    <button
                        className="p-4 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700 transition-all"
                        onClick={() => setShowWebcam(!showWebcam)}
                    >
                        {showWebcam ? "Hide Webcam" : "Show Webcam"}
                    </button>
                )}

                <button
                    className="p-4 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
                    onClick={() => {
                        setIsStereo(!isStereo);
                    }}
                >
                    <span className="text-lg">🥽</span>
                    {isStereo ? "Exit VR" : "Enter VR"}
                </button>
            </div>

            {/* Status Bar */}
            <div className="absolute bottom-0 w-full bg-black/80 backdrop-blur-md border-t border-white/10 py-2 px-4 text-xs font-mono text-zinc-400 flex items-center justify-center z-50">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span>Connected! Waiting for data...</span>
                </div>
                <span className="mx-3 text-zinc-700">|</span>
                <span>Room: <span className="text-zinc-200">{roomId}</span></span>
                <span className="mx-3 text-zinc-700">|</span>
                <span>Peers: <span className="text-zinc-200">{peers.length}</span></span>
                <span className="mx-3 text-zinc-700">|</span>
                <span>Role: <span className="text-zinc-200 uppercase">{deviceRole}</span></span>
            </div>
        </div>
    );
}
