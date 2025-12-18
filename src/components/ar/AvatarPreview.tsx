"use client";

import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Avatar } from './Avatar';

interface AvatarPreviewProps {
    url: string;
}

export default function AvatarPreview({ url }: AvatarPreviewProps) {
    const faceResultRef = useRef(null);
    const handResultRef = useRef(null);

    return (
        <div className="w-full h-full">
            <Canvas
                camera={{ position: [0, 0, 3], fov: 45 }}
                gl={{ alpha: true }}
            >
                <ambientLight intensity={0.8} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Suspense fallback={null}>
                    <group position={[0, -2.2, 0]} scale={1.8}>
                        <Avatar faceResultRef={faceResultRef as any} handResultRef={handResultRef as any} url={url} />
                    </group>
                    <Environment files="/potsdamer_platz_1k.hdr" />
                </Suspense>

                <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={4} />
            </Canvas>
        </div>
    );
}

