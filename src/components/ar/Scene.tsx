import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls } from '@react-three/drei';
import { Avatar } from './Avatar';
import { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision';

interface SceneProps {
    faceResult: FaceLandmarkerResult | null;
    handResult?: HandLandmarkerResult | null;
    className?: string;
    avatarUrl?: string;
}

export const Scene: React.FC<SceneProps> = ({ faceResult, handResult, className, avatarUrl }) => {
    return (
        <div className={className}>
            <Canvas
                camera={{ position: [0, 0, 3], fov: 50 }}
                gl={{ preserveDrawingBuffer: true, alpha: true }} // Important for stream capture
            >
                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                <Suspense fallback={null}>
                    <Avatar faceResult={faceResult} handResult={handResult} url={avatarUrl} />
                    <Environment preset="city" />
                </Suspense>

                <OrbitControls enableZoom={false} enablePan={false} />
            </Canvas>
        </div>
    );
};
