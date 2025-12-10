"use strict";
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AvatarPreview from "@/components/ar/AvatarPreview";

export default function Home() {
    const router = useRouter();
    const [avatars, setAvatars] = useState<string[]>([]);
    const [selectedAvatar, setSelectedAvatar] = useState<string>("");
    const [roomId, setRoomId] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetch("/api/avatars")
            .then((res) => res.json())
            .then((data) => {
                if (data.avatars && data.avatars.length > 0) {
                    setAvatars(data.avatars);
                    setSelectedAvatar(data.avatars[0]);
                }
            })
            .catch((err) => console.error("Failed to load avatars:", err));
    }, []);

    const createRoom = () => {
        const newRoomId = Math.random().toString(36).substring(2, 9);
        router.push(`/room/${newRoomId}?avatar=${selectedAvatar}`);
    };

    const joinRoom = () => {
        if (!roomId.trim()) return;
        router.push(`/room/${roomId}?avatar=${selectedAvatar}`);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-950 text-white relative overflow-hidden">
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
                <div className="grid md:grid-cols-2 gap-8 w-full max-w-2xl">
                    {/* Create Room */}
                    <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm flex flex-col items-center gap-6 hover:border-zinc-700 transition-colors">
                        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-2xl">
                            +
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-semibold mb-2">Create New Room</h3>
                            <p className="text-sm text-zinc-400">Start a new call and invite others</p>
                        </div>
                        <button
                            onClick={createRoom}
                            className="w-full py-3 px-6 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-all shadow-lg shadow-blue-600/20"
                        >
                            Create Room
                        </button>
                    </div>

                    {/* Join Room */}
                    <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm flex flex-col items-center gap-6 hover:border-zinc-700 transition-colors">
                        <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-2xl">
                            →
                        </div>
                        <div className="text-center">
                            <h3 className="text-xl font-semibold mb-2">Join Existing Room</h3>
                            <p className="text-sm text-zinc-400">Enter a room ID to join a call</p>
                        </div>
                        <div className="w-full space-y-3">
                            <input
                                type="text"
                                placeholder="Enter Room ID"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-center"
                            />
                            <button
                                onClick={joinRoom}
                                disabled={!roomId.trim()}
                                className="w-full py-3 px-6 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold transition-all shadow-lg shadow-purple-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Join Room
                            </button>
                        </div>
                    </div>
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