"use client";

import React, { Suspense, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Avatar } from "./Avatar";
import { FaceLandmarkerResult, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import * as THREE from "three";

interface Peer {
    peerId: string;
    userName: string;
    avatar?: string;
    stream: MediaStream;
}

export interface SceneProps {
    faceResultRef?: React.MutableRefObject<FaceLandmarkerResult | null>;
    handResultRef?: React.MutableRefObject<HandLandmarkerResult | null>;
    className?: string;
    avatarUrl?: string;
    peers?: Peer[];
    isStereo?: boolean;
    userName?: string;
    externalExpressions?: {
        blendshapes: Record<string, number>;
        rotation: number[] | null;
        handResult?: HandLandmarkerResult | null;
    };
}

/* ---------------- TEXT LABEL ---------------- */
const SimpleText: React.FC<{
    text: string;
    position: [number, number, number];
    fontSize?: number;
}> = ({ text, position, fontSize = 0.2 }) => {
    const texture = useMemo(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");

        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = "bold 120px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.strokeStyle = "black";
            ctx.lineWidth = 10;
            ctx.strokeText(text, 512, 128);
            ctx.fillStyle = "white";
            ctx.fillText(text, 512, 128);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        return tex;
    }, [text]);

    const height = fontSize * 1.5;
    const width = height * 4;

    return (
        <mesh position={position}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
        </mesh>
    );
};

/* ---------------- REMOTE VIDEO ---------------- */
const RemoteVideoPlane: React.FC<{
    stream: MediaStream;
    position: [number, number, number];
    rotation: [number, number, number];
    userName: string;
    avatar?: string;
}> = ({ stream, position, rotation, userName, avatar }) => {
    const video = useMemo(() => {
        const v = document.createElement("video");
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        v.play().catch((err) => console.error("Video play error:", err));
        return v;
    }, [stream]);

    const label = `${userName} ${avatar ? `(${avatar.replace('.glb', '')})` : ''}`;

    return (
        <group position={position} rotation={rotation}>
            <mesh>
                <planeGeometry args={[3.2, 1.8]} />
                <meshBasicMaterial side={THREE.DoubleSide} color="white">
                    <videoTexture attach="map" args={[video]} encoding={THREE.sRGBEncoding} />
                </meshBasicMaterial>
            </mesh>
            <SimpleText text={label} position={[0, 1.1, 0.1]} fontSize={0.2} />
        </group>
    );
};

/* ---------------- SCENE CONTENT ---------------- */
const SceneContent: React.FC<Omit<SceneProps, 'className'>> = ({
    faceResultRef,
    handResultRef,
    avatarUrl,
    peers = [],
    isStereo = false,
    userName = "User",
    externalExpressions,
}) => {
    const { gl, scene, camera, size } = useThree();
    const stereoCamera = useMemo(() => new THREE.StereoCamera(), []);

    useFrame(() => {
        if (isStereo) {
            gl.autoClear = false;
            gl.clear();

            camera.updateMatrixWorld();
            stereoCamera.aspect = 0.5;
            stereoCamera.update(camera as THREE.PerspectiveCamera);

            // Left eye
            gl.setViewport(0, 0, size.width / 2, size.height);
            gl.setScissor(0, 0, size.width / 2, size.height);
            gl.setScissorTest(true);
            gl.render(scene, stereoCamera.cameraL);

            // Right eye
            gl.setViewport(size.width / 2, 0, size.width / 2, size.height);
            gl.setScissor(size.width / 2, 0, size.width / 2, size.height);
            gl.setScissorTest(true);
            gl.render(scene, stereoCamera.cameraR);

            gl.setScissorTest(false);
        }
    }, 1);

    return (
        <>
            <color attach="background" args={[isStereo ? '#000000' : '#18181b']} />
            <ambientLight intensity={1.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />
            <Suspense fallback={null}>
                {isStereo ? (
                    <group rotation={[0, 0, 0]}>
                        {/* VR MODE: Immersive semi-circle */}
                        {/* Local Avatar (Self-View) - Centered and Scaled Down to match screenshot */}
                        <group position={[0, -2.5, -3]} scale={1.8}>
                            <Avatar
                                faceResultRef={faceResultRef}
                                handResultRef={handResultRef}
                                url={avatarUrl}
                                externalExpressions={externalExpressions}
                            />
                            {/* Label for Local Avatar */}
                            <SimpleText
                                text={`${userName} (${avatarUrl?.replace('.glb', '') || 'avatar'})`}
                                position={[0, 2.2, 0]}
                                fontSize={0.2}
                            />
                        </group>

                        {/* Peers - Floating in front of camera */}
                        {peers.map((peer, index) => {
                            const angle = (index - (peers.length - 1) / 2) * 0.5; // 0.5 radian spacing
                            const dist = 1.5; // Distance from camera (which is at z=3)

                            // Calculate position relative to camera at (0,0,2.2)
                            // We want them to form a curve centered on the camera
                            const x = Math.sin(angle) * dist;
                            const z = 2.2 - Math.cos(angle) * dist;
                            const y = -0.6; // Lower part of view

                            return (
                                <group key={peer.peerId} position={[x, y, z]} rotation={[0, -angle, 0]} scale={0.3}>
                                    <RemoteVideoPlane
                                        stream={peer.stream}
                                        position={[0, 0, 0]}
                                        rotation={[0, 0, 0]}
                                        userName={peer.userName}
                                        avatar={peer.avatar}
                                    />
                                </group>
                            );
                        })}
                    </group>
                ) : (
                    <>
                        {/* AR MODE: Standard Avatar View */}
                        <group position={[peers.length > 0 ? -2 : 0, -2.8, 0]} scale={2.2}>
                            <Avatar
                                faceResultRef={faceResultRef}
                                handResultRef={handResultRef}
                                url={avatarUrl}
                                externalExpressions={externalExpressions}
                            />
                        </group>

                        {/* Render Peers in AR Mode - Side by Side */}
                        {peers.map((peer, index) => {
                            // Position to the right of local avatar
                            const x = 2 + (index * 3.5);
                            return (
                                <RemoteVideoPlane
                                    key={peer.peerId}
                                    stream={peer.stream}
                                    position={[x, 0, 0]}
                                    rotation={[0, 0, 0]}
                                    userName={peer.userName}
                                    avatar={peer.avatar}
                                />
                            );
                        })}

                        <OrbitControls enableZoom={true} enablePan={true} target={[0, 0, 0]} />
                    </>
                )}

                <Environment files="/potsdamer_platz_1k.hdr" />
            </Suspense>
        </>
    );
};

/* ---------------- ROOT SCENE ---------------- */
export const Scene: React.FC<SceneProps> = ({ className, ...props }) => {
    return (
        <div className={className}>
            <Canvas
                camera={{ position: [0, 0, 2.2], fov: 20 }}
                gl={{ preserveDrawingBuffer: true, alpha: true }}
            >
                <SceneContent {...props} />
            </Canvas>
        </div>
    );
};
