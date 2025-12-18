"use client";

import React, { Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Avatar } from './Avatar';
import { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface Peer {
    peerId: string;
    userName: string;
    avatar?: string;
    stream: MediaStream;
}

interface SceneProps {
    faceResultRef?: React.MutableRefObject<FaceLandmarkerResult | null>;
    handResultRef?: React.MutableRefObject<HandLandmarkerResult | null>;
    className?: string;
    avatarUrl?: string;
    peers?: Peer[];
    isStereo?: boolean;
    externalExpressions?: {
        blendshapes: Record<string, number>;
        rotation: number[] | null;
    };
}

const RemoteVideoPlane: React.FC<{ stream: MediaStream; position: [number, number, number]; rotation: [number, number, number] }> = ({ stream, position, rotation }) => {
    const video = useMemo(() => {
        const v = document.createElement('video');
        v.srcObject = stream;
        v.muted = true;
        v.play().catch(console.error);
        return v;
    }, [stream]);

    return (
        <mesh position={position} rotation={rotation}>
            <planeGeometry args={[3.2, 1.8]} />
            <meshBasicMaterial side={THREE.DoubleSide}>
                <videoTexture attach="map" args={[video]} encoding={THREE.sRGBEncoding} />
            </meshBasicMaterial>
        </mesh>
    );
};

const SceneContent: React.FC<Omit<SceneProps, 'className'>> = ({ faceResultRef, handResultRef, avatarUrl, peers = [], isStereo = false, externalExpressions }) => {
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
            <color attach="background" args={[isStereo ? '#09090b' : '#18181b']} />
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />

            <Suspense fallback={null}>
                {isStereo ? (
                    <group rotation={[0, 0, 0]}>
                        {/* VR MODE: Immersive semi-circle */}
                        <group position={[0, -2.0, 2]} scale={1.2}>
                            <Avatar
                                faceResultRef={faceResultRef}
                                handResultRef={handResultRef}
                                url={avatarUrl}
                                externalExpressions={externalExpressions}
                            />
                        </group>

                        {peers.map((peer, index) => {
                            const angle = (index - (peers.length - 1) / 2) * 0.6;
                            const radius = 4;
                            const x = Math.sin(angle) * radius;
                            const z = -Math.cos(angle) * radius;
                            return (
                                <RemoteVideoPlane
                                    key={peer.peerId}
                                    stream={peer.stream}
                                    position={[x, 0, z]}
                                    rotation={[0, -angle, 0]}
                                />
                            );
                        })}
                    </group>
                ) : (
                    <>
                        {/* AR MODE: Standard Avatar View */}
                        <group position={[0, -2.2, 0]} scale={1.8}>
                            <Avatar
                                faceResultRef={faceResultRef}
                                handResultRef={handResultRef}
                                url={avatarUrl}
                                externalExpressions={externalExpressions}
                            />
                        </group>
                        <OrbitControls enableZoom={true} enablePan={false} target={[0, 0, 0]} />
                    </>
                )}

                <Environment files="/potsdamer_platz_1k.hdr" />
            </Suspense>
        </>
    );
};

export const Scene: React.FC<SceneProps> = (props) => {
    return (
        <div className={props.className}>
            <Canvas
                camera={{ position: [0, 0, 3], fov: 45 }}
                gl={{ preserveDrawingBuffer: true, alpha: true }}
            >
                <SceneContent {...props} />
            </Canvas>
        </div>
    );
};
