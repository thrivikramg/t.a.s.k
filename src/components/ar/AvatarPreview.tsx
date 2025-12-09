"use client";

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Avatar } from './Avatar';

interface AvatarPreviewProps {
    url: string;
}

export default function AvatarPreview({ url }: AvatarPreviewProps) {
    return (
        <div className="w-full h-full">
            <Canvas
                camera={{ position: [0, 0, 3], fov: 50 }}
                gl={{ alpha: true }}
            >
                <ambientLight intensity={0.8} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Suspense fallback={null}>
                    <Avatar faceResult={null} handResult={null} url={url} />
                    <Environment preset="city" />
                </Suspense>

                <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={4} />
            </Canvas>
        </div>
    );
}
