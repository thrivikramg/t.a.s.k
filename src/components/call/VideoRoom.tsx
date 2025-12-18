"use client";

import { useEffect, useRef, useState } from "react";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { Scene } from "@/components/ar/Scene";
import { xrStore } from "@/lib/xrStore";
import { io, Socket } from "socket.io-client";
import SimplePeer from "simple-peer";
import { useRouter } from "next/navigation";

interface VideoRoomProps {
    roomId: string;
    avatar?: string;
}

export default function VideoRoom({ roomId, avatar }: VideoRoomProps) {
    const { videoRef, faceResultRef, handResultRef, stream } = useFaceTracking();
    const [peers, setPeers] = useState<{ peerId: string; userName: string; avatar?: string; stream: MediaStream }[]>([]);
    const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map());
    const socketRef = useRef<Socket>();
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const [showWebcam, setShowWebcam] = useState(false);
    const streamRef = useRef<MediaStream | null>(null);
    const [isStereo, setIsStereo] = useState(false);
    const [showVRMenu, setShowVRMenu] = useState(false);
    const [pairingId, setPairingId] = useState("");
    const router = useRouter();

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

    /** ------------------------ WEBRTC ------------------------ **/
    /** ------------------------ WEBRTC ------------------------ **/
    const getCanvasStream = () => {
        const canvas = canvasContainerRef.current?.querySelector("canvas");
        if (!canvas) {
            console.error("Canvas not found for stream capture");
            return null;
        }

        // Cast to any because captureStream might not be in the TS definition
        const stream = (canvas as any).captureStream(30) as MediaStream;

        if (streamRef.current) {
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
        if (!stream) return;

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
            socket.emit("offer", { target: userToSignal, signal, callerName: userName, callerAvatar: avatar });
        });

        peer.on("stream", (stream) => {
            setPeers((prev) => [...prev, { peerId: userToSignal, userName: remoteName, avatar: remoteAvatar, stream }]);
        });

        peersRef.current.set(userToSignal, peer);
    };

    const addPeer = (incomingSignal: any, callerId: string, socket: Socket, remoteName: string, remoteAvatar?: string) => {
        const stream = getCanvasStream();
        if (!stream) return;

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
            socket.emit("answer", { target: callerId, signal, senderName: userName, senderAvatar: avatar });
        });

        peer.on("stream", (stream) => {
            setPeers((prev) => [...prev, { peerId: callerId, userName: remoteName, avatar: remoteAvatar, stream }]);
        });

        peer.signal(incomingSignal);
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
            <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 text-white">
                <h1 className="text-3xl font-bold mb-8">Join Room</h1>
                <div className="bg-black/50 p-8 rounded-2xl border border-white/10 shadow-2xl w-full max-w-md">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Enter your name</label>
                    <input
                        type="text"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        className="w-full px-4 py-3 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
                        placeholder="Your Name"
                    />
                    <button
                        onClick={() => {
                            if (userName.trim()) setHasJoined(true);
                        }}
                        disabled={!userName.trim()}
                        className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Join Call
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-screen w-screen bg-zinc-900 overflow-hidden flex flex-col">
            {/* Main Grid */}
            <div className={`flex-1 p-4 ${isStereo ? 'hidden' : 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto content-start'}`}>
                {/* Local Avatar (Self) */}
                <div
                    ref={canvasContainerRef}
                    className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 shadow-lg bg-black/40 backdrop-blur-md"
                >
                    <Scene
                        faceResultRef={faceResultRef}
                        handResultRef={handResultRef}
                        className="w-full h-full"
                        avatarUrl={avatar}
                        peers={peers}
                        isStereo={isStereo}
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 rounded text-[10px] text-white/80 font-medium backdrop-blur-sm">
                        {userName} (You)
                    </div>
                </div>


                {/* Remote Peers */}
                {peers.map((peer) => (
                    <div key={peer.peerId} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black/50 border border-white/10 shadow-lg">
                        <video
                            ref={(ref) => {
                                if (ref) ref.srcObject = peer.stream;
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

                {/* Placeholder if alone (optional, or just let the grid fill) */}
                {peers.length === 0 && (
                    <div className="hidden md:flex items-center justify-center rounded-xl border border-dashed border-white/10 text-white/20 font-light tracking-widest uppercase text-xs aspect-video">
                        Waiting...
                    </div>
                )}
            </div>

            {/* Stereo Fullscreen Mode */}
            {isStereo && (
                <div className="absolute inset-0 z-50 bg-black">
                    <Scene
                        faceResultRef={faceResultRef}
                        handResultRef={handResultRef}
                        className="w-full h-full"
                        avatarUrl={avatar}
                        peers={peers}
                        isStereo={true}
                    />
                    <button
                        onClick={() => setIsStereo(false)}
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white z-[60] backdrop-blur-md"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Draggable Webcam */}
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

            {/* VR Device Selection Menu */}
            {showVRMenu && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
                    <div className="bg-zinc-900 border border-white/10 p-8 rounded-3xl shadow-2xl max-w-sm w-full mx-4 space-y-6">
                        <div className="text-center space-y-2">
                            <h3 className="text-2xl font-bold text-white">Select Device Role</h3>
                            <p className="text-sm text-zinc-400">Choose how you want to use this device</p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Pairing ID</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 1234"
                                    value={pairingId}
                                    onChange={(e) => setPairingId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all text-white text-center font-mono"
                                />
                                <p className="text-[10px] text-zinc-500 text-center">Use the same ID on both devices to link them</p>
                            </div>

                            <div className="grid gap-3">
                                <button
                                    onClick={() => router.push(`/sender/${roomId}?pairingId=${pairingId}`)}
                                    disabled={!pairingId.trim()}
                                    className="group p-4 rounded-2xl bg-blue-600/10 border border-blue-500/30 hover:bg-blue-600 hover:border-blue-500 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">💻</span>
                                        <div>
                                            <p className="font-bold text-white group-hover:text-white">Laptop (Sender)</p>
                                            <p className="text-xs text-blue-300/70 group-hover:text-blue-100">Capture face tracking</p>
                                        </div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => router.push(`/vr-room/${roomId}?avatar=${avatar}&pairingId=${pairingId}`)}
                                    disabled={!pairingId.trim()}
                                    className="group p-4 rounded-2xl bg-purple-600/10 border border-purple-500/30 hover:bg-purple-600 hover:border-purple-500 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-2xl">📱</span>
                                        <div>
                                            <p className="font-bold text-white group-hover:text-white">Mobile (VR Room)</p>
                                            <p className="text-xs text-purple-300/70 group-hover:text-purple-100">View in VR headset</p>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowVRMenu(false)}
                            className="w-full py-3 text-sm text-zinc-500 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Controls */}
            {!isStereo && (
                <div className="absolute bottom-6 w-full flex items-center justify-center gap-4 z-20">
                    <button
                        className="p-4 rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
                        onClick={() => setShowWebcam(!showWebcam)}
                    >
                        {showWebcam ? "Hide Webcam" : "Show Webcam"}
                    </button>

                    <button
                        className="p-4 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center gap-2"
                        onClick={() => setShowVRMenu(true)}
                    >
                        <span className="text-lg">🥽</span>
                        Enter VR
                    </button>

                    <div className="text-white text-sm bg-white/10 px-3 py-1 rounded-full">
                        Room: {roomId}
                    </div>
                </div>
            )}
        </div>
    );
}
