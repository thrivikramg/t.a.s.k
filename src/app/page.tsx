"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AvatarPreview from "@/components/ar/AvatarPreview";

export default function Home() {
    const router = useRouter();
    const [avatars, setAvatars] = useState<string[]>([]);
    const [selectedAvatar, setSelectedAvatar] = useState<string>("");
    const [roomId, setRoomId] = useState("");

    useEffect(() => {
        fetch("/api/avatars")
            .then(async (res) => {
                if (!res.ok) {
                    console.error("Server error:", res.status, await res.text());
                    return { avatars: [] };
                }
                const contentType = res.headers.get("content-type");
                if (!contentType || !contentType.includes("application/json")) {
                    const text = await res.text();
                    console.warn("Received non-JSON response:", text);
                    return { avatars: [] };
                }
                return res.json();
            })
            .then((data) => {
                if (data && data.avatars && data.avatars.length > 0) {
                    setAvatars(data.avatars);
                    setSelectedAvatar(data.avatars[0]);
                }
            })
            .catch((err) => console.error("Failed to load avatars:", err));
    }, []);

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-950 text-white relative">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
            </div>

            <div className="z-10 w-full max-w-4xl flex flex-col items-center gap-12">
                <div className="text-center space-y-4">
                    <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
                        T.A.S.K
                    </h1>
                    <p className="text-xl text-zinc-400 max-w-2xl">
                        Telepresence Avatar System for Knowledge-sharing
                    </p>
                </div>

                {/* Character Selection */}
                <div className="w-full space-y-6">
                    <h2 className="text-2xl font-semibold text-center">Choose Your Avatar</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {avatars.map((avatar) => (
                            <button
                                key={avatar}
                                onClick={() => setSelectedAvatar(avatar)}
                                className={`relative group p-4 rounded-xl border-2 transition-all duration-300 ${selectedAvatar === avatar
                                    ? "border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-800"
                                    }`}
                            >
                                <div className="aspect-square rounded-lg bg-zinc-800 mb-3 flex items-center justify-center overflow-hidden relative">
                                    <AvatarPreview url={avatar} />
                                </div>
                                <p className="font-medium text-sm truncate">{avatar.replace(".glb", "")}</p>

                                {selectedAvatar === avatar && (
                                    <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
                    {/* Standard Mode */}
                    <div className="space-y-8">
                        <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm flex flex-col items-center gap-6 hover:border-zinc-700 transition-colors">
                            <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-2xl">
                                🌐
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-semibold mb-2">Standard Video Call</h3>
                                <p className="text-sm text-zinc-400">Join directly from this device</p>
                            </div>
                            <div className="w-full space-y-3">
                                <input
                                    type="text"
                                    placeholder="Room ID (Optional)"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-700 focus:border-blue-500 outline-none transition-all text-center"
                                />
                                <button
                                    onClick={() => {
                                        const id = roomId.trim() || Math.random().toString(36).substring(2, 9);
                                        router.push(`/room/${id}?avatar=${selectedAvatar}`);
                                    }}
                                    className="w-full py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all"
                                >
                                    {roomId.trim() ? "Join Room" : "Create New Room"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Pairing Mode (Laptop + Mobile) */}
                    <div className="p-8 rounded-2xl bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 backdrop-blur-sm flex flex-col items-center gap-6 hover:border-purple-500/50 transition-colors relative overflow-hidden">
                        <div className="absolute top-2 right-2 px-2 py-1 bg-purple-600 rounded text-[10px] font-bold uppercase tracking-wider">
                            Recommended
                        </div>
                        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-2xl">
                            💻 + 📱
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-semibold mb-2">Device Pairing Mode</h3>
                            <p className="text-sm text-zinc-400">Use Laptop for tracking + Mobile for VR</p>
                        </div>

                        <div className="w-full space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        const id = roomId.trim() || Math.random().toString(36).substring(2, 9);
                                        const pId = Math.floor(1000 + Math.random() * 9000);
                                        router.push(`/sender/${id}?pairingId=${pId}`);
                                    }}
                                    className="py-3 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium border border-zinc-700 flex flex-col items-center gap-1"
                                >
                                    <span>Step 1</span>
                                    <span className="text-[10px] opacity-60">Open on Laptop</span>
                                </button>
                                <button
                                    onClick={() => {
                                        const id = roomId.trim() || Math.random().toString(36).substring(2, 9);
                                        const pId = Math.floor(1000 + Math.random() * 9000);
                                        router.push(`/vr-room/${id}?avatar=${selectedAvatar}&pairingId=${pId}`);
                                    }}
                                    className="py-3 px-4 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium flex flex-col items-center gap-1"
                                >
                                    <span>Step 2</span>
                                    <span className="text-[10px] opacity-80">Open on Mobile</span>
                                </button>
                            </div>
                            <p className="text-[10px] text-center text-zinc-500 italic">
                                Tip: Use the same Room ID and Pairing ID on both devices.
                            </p>
                        </div>
                    </div>
                </div>


                {/* Premium / Buy Section */}
                <div className="w-full max-w-4xl py-12 flex flex-col items-center gap-8 border-t border-zinc-800">
                    <div className="text-center space-y-2">
                        <h2 className="text-3xl font-bold text-white">Unlock Premium Features</h2>
                        <p className="text-zinc-400">Get access to exclusive avatars and advanced tracking capabilities.</p>
                    </div>

                    <button
                        onClick={() => router.push('/coming-soon')}
                        className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl font-bold text-lg shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 hover:scale-105"
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Buy Premium Access
                            <span className="group-hover:translate-x-1 transition-transform">→</span>
                        </span>
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 blur opacity-50 group-hover:opacity-75 transition-opacity" />
                    </button>
                </div>

                {/* About & How it Works */}
                <div className="grid md:grid-cols-2 gap-12 w-full max-w-4xl pt-12 border-t border-zinc-800">
                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold text-blue-400">About T.A.S.K</h3>
                        <p className="text-zinc-400 leading-relaxed">
                            T.A.S.K (Telepresence Avatar System for Knowledge-sharing) is a cutting-edge communication platform that bridges the gap between physical and digital presence. By leveraging advanced facial tracking and 3D avatar technology, we enable users to interact in a more immersive and expressive way, preserving privacy while maintaining the nuances of human connection.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <h3 className="text-2xl font-bold text-purple-400">How It Works</h3>
                        <ul className="space-y-3 text-zinc-400">
                            <li className="flex items-start gap-3">
                                <span className="mt-1 w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">1</span>
                                <span><strong>Select Your Avatar:</strong> Choose a 3D character that represents you from our curated collection.</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="mt-1 w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">2</span>
                                <span><strong>Real-time Tracking:</strong> Our AI-powered system tracks your facial expressions and hand gestures via your webcam.</span>
                            </li>
                            <li className="flex items-start gap-3">
                                <span className="mt-1 w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-bold">3</span>
                                <span><strong>Connect & Share:</strong> Join a room to interact with others. Your avatar mimics your movements in real-time, creating a lifelike presence.</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </main >
    );
}