"use client";

import React, { useEffect, useRef } from 'react';
import { useFrame, useGraph, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface AvatarProps {
  faceResult: FaceLandmarkerResult | null;
  handResult?: HandLandmarkerResult | null;
  url?: string;
}

// Mapping from MediaPipe names to possible GLB MorphTarget names (kept small for brevity)
const BLENDSHAPE_MAP: Record<string, string[]> = {
  jawOpen: ['jawOpen', 'JawOpen', 'mouthOpen', 'MouthOpen', 'viseme_aa'],
  mouthSmileLeft: ['mouthSmileLeft', 'MouthSmileLeft', 'smileLeft', 'Smile_L'],
  mouthSmileRight: ['mouthSmileRight', 'MouthSmileRight', 'smileRight', 'Smile_R'],
  mouthPucker: ['mouthPucker', 'MouthPucker', 'mouth_pucker', 'viseme_U'],
  eyeBlinkLeft: ['eyeBlinkLeft', 'EyeBlinkLeft', 'blink_L', 'Blink_L'],
  eyeBlinkRight: ['eyeBlinkRight', 'EyeBlinkRight', 'blink_R', 'Blink_R'],
  // add more mappings if needed
};

export const Avatar: React.FC<AvatarProps> = ({ faceResult, handResult, url = '/avatar1.glb' }) => {
  const safeUrl = url.startsWith('/') || url.startsWith('http') ? url : `/${url}`;
  const { scene } = useGLTF(safeUrl);
  const { nodes } = useGraph(scene);
  const { camera } = useThree();

  // Head / eyes
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const leftEyeBoneRef = useRef<THREE.Bone | null>(null);
  const rightEyeBoneRef = useRef<THREE.Bone | null>(null);

  // Arms / Hands
  const leftArmRef = useRef<THREE.Bone | null>(null);
  const rightArmRef = useRef<THREE.Bone | null>(null);
  const leftForeArmRef = useRef<THREE.Bone | null>(null);
  const rightForeArmRef = useRef<THREE.Bone | null>(null);

  // Cache morph targets for performance
  const morphMeshes = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    // 1. Find Bones (head, eyes, arms)
    let head: any = (nodes as any).Head || (nodes as any).Neck || (nodes as any).head || (nodes as any).neck;
    let lEye: any = (nodes as any).LeftEye || (nodes as any).EyeLeft || (nodes as any).eye_L || (nodes as any).Eye_L;
    let rEye: any = (nodes as any).RightEye || (nodes as any).EyeRight || (nodes as any).eye_R || (nodes as any).Eye_R;

    let lArm: any = (nodes as any).LeftArm || (nodes as any).ArmLeft || (nodes as any).arm_L || (nodes as any).LeftShoulder;
    let rArm: any = (nodes as any).RightArm || (nodes as any).ArmRight || (nodes as any).arm_R || (nodes as any).RightShoulder;
    let lForeArm: any = (nodes as any).LeftForeArm || (nodes as any).ForeArmLeft || (nodes as any).forearm_L || (nodes as any).LeftElbow;
    let rForeArm: any = (nodes as any).RightForeArm || (nodes as any).ForeArmRight || (nodes as any).forearm_R || (nodes as any).RightElbow;

    // Traverse as fallback
    scene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        const name = bone.name || '';

        if (!head && (/head|neck/i).test(name)) head = bone;
        if (!lEye && /eye.*l/i.test(name)) lEye = bone;
        if (!rEye && /eye.*r/i.test(name)) rEye = bone;

        if (!lArm && (/arm.*l/i.test(name) && !/fore/i.test(name))) lArm = bone;
        if (!rArm && (/arm.*r/i.test(name) && !/fore/i.test(name))) rArm = bone;
        if (!lForeArm && /fore.*l/i.test(name)) lForeArm = bone;
        if (!rForeArm && /fore.*r/i.test(name)) rForeArm = bone;
      }
    });

    if (head) headBoneRef.current = head as THREE.Bone;
    if (lEye) leftEyeBoneRef.current = lEye as THREE.Bone;
    if (rEye) rightEyeBoneRef.current = rEye as THREE.Bone;

    if (lArm) leftArmRef.current = lArm as THREE.Bone;
    if (rArm) rightArmRef.current = rArm as THREE.Bone;
    if (lForeArm) leftForeArmRef.current = lForeArm as THREE.Bone;
    if (rForeArm) rightForeArmRef.current = rForeArm as THREE.Bone;

    // 2. Find meshes with morph targets
    const meshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).morphTargetDictionary) {
        meshes.push(child as THREE.Mesh);
      }
    });
    morphMeshes.current = meshes;
  }, [scene, nodes]);



  // ---------- Main loop ----------
  useFrame((state) => {
    let isTalking = false;
    let blendshapes: any[] = [];

    // --- Face Tracking ---
    if (faceResult && faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
      blendshapes = faceResult.faceBlendshapes[0].categories;
      const matrix = faceResult.facialTransformationMatrixes?.[0];

      const getScore = (name: string) => blendshapes.find((b) => b.categoryName === name)?.score || 0;

      // Check for talking
      const jawOpen = getScore('jawOpen');
      const mouthOpen = getScore('mouthOpen');
      isTalking = jawOpen > 0.05 || mouthOpen > 0.05;

      // Head rotation
      if (matrix && headBoneRef.current) {
        const m = new THREE.Matrix4().fromArray(matrix.data);
        const rotation = new THREE.Euler().setFromRotationMatrix(m);
        const damp = 0.5;
        headBoneRef.current.rotation.x = THREE.MathUtils.lerp(headBoneRef.current.rotation.x, rotation.x, damp);
        headBoneRef.current.rotation.y = THREE.MathUtils.lerp(headBoneRef.current.rotation.y, -rotation.y, damp);
        headBoneRef.current.rotation.z = THREE.MathUtils.lerp(headBoneRef.current.rotation.z, -rotation.z, damp);
      }

      // Eye rotation
      if (leftEyeBoneRef.current && rightEyeBoneRef.current) {
        const lookUp = getScore('eyeLookUpLeft');
        const lookDown = getScore('eyeLookDownLeft');
        const lookIn = getScore('eyeLookInLeft');
        const lookOut = getScore('eyeLookOutLeft');

        const pitch = (lookDown - lookUp) * 0.5;
        const yawL = (lookOut - lookIn) * 0.5;
        const yawR = (lookIn - lookOut) * 0.5;

        const damp = 0.5;
        leftEyeBoneRef.current.rotation.x = THREE.MathUtils.lerp(leftEyeBoneRef.current.rotation.x, pitch, damp);
        leftEyeBoneRef.current.rotation.y = THREE.MathUtils.lerp(leftEyeBoneRef.current.rotation.y, yawL, damp);

        rightEyeBoneRef.current.rotation.x = THREE.MathUtils.lerp(rightEyeBoneRef.current.rotation.x, pitch, damp);
        rightEyeBoneRef.current.rotation.y = THREE.MathUtils.lerp(rightEyeBoneRef.current.rotation.y, yawR, damp);
      }

      // Blendshapes to morph targets
      morphMeshes.current.forEach((mesh) => {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
        const dictionary = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;

        blendshapes.forEach((blendshape) => {
          const name = blendshape.categoryName;
          const score = blendshape.score;

          let index = dictionary[name];
          if (index === undefined && BLENDSHAPE_MAP[name]) {
            for (const mappedName of BLENDSHAPE_MAP[name]) {
              if (dictionary[mappedName] !== undefined) {
                index = dictionary[mappedName];
                break;
              }
            }
          }

          if (index !== undefined) {
            let finalScore = score;
            let lerpFactor = 0.5;
            if (name.toLowerCase().includes('blink')) {
              finalScore = Math.min(1, score * 1.5);
              lerpFactor = 0.8;
            }
            influences[index] = THREE.MathUtils.lerp(influences[index], finalScore, lerpFactor);
          }
        });
      });
    }

    // --- Gestures (Talking & Idle) ---
    const time = state.clock.elapsedTime;

    // Base Pose (Relaxed) - Assuming T-Pose default
    // Left Arm: -Z is down (approx -80 deg)
    // Right Arm: +Z is down (approx 80 deg)
    const baseLeftArmZ = -0.3; // Higher elbows (almost horizontal)
    const baseRightArmZ = 0.3;
    const baseArmX = 1.0; // More forward reach
    const baseForeArmX = 2.2; // Hands higher up

    // Idle Breathing
    const breathSpeed = 1.5;
    const breathAmp = 0.02;
    const breath = Math.sin(time * breathSpeed) * breathAmp;

    // Talking Gestures
    let gestureLeftZ = 0;
    let gestureRightZ = 0;
    let gestureLeftX = 0;
    let gestureRightX = 0;
    let gestureForeArm = 0;

    if (isTalking) {
      const speed = 5;
      const amp = 0.1; // Subtle amplitude

      // Asymmetric movements
      gestureLeftZ = Math.sin(time * speed) * amp;
      gestureRightZ = Math.cos(time * speed * 0.8) * amp;

      gestureLeftX = Math.sin(time * speed * 0.5) * (amp * 0.5);
      gestureRightX = Math.cos(time * speed * 0.6) * (amp * 0.5);

      gestureForeArm = Math.sin(time * speed * 1.2) * 0.15;
    }

    const damp = 0.1;

    if (leftArmRef.current) {
      const targetZ = baseLeftArmZ + breath + gestureLeftZ;
      const targetX = baseArmX + gestureLeftX;
      leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetZ, damp);
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetX, damp);
    }

    if (rightArmRef.current) {
      const targetZ = baseRightArmZ - breath + gestureRightZ;
      const targetX = baseArmX + gestureRightX;
      rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetZ, damp);
      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetX, damp);
    }

    if (leftForeArmRef.current) {
      const targetX = baseForeArmX + gestureForeArm;
      leftForeArmRef.current.rotation.x = THREE.MathUtils.lerp(leftForeArmRef.current.rotation.x, targetX, damp);
    }

    if (rightForeArmRef.current) {
      const targetX = baseForeArmX + gestureForeArm;
      rightForeArmRef.current.rotation.x = THREE.MathUtils.lerp(rightForeArmRef.current.rotation.x, targetX, damp);
    }
  });

  return (
    <group position={[0, -8, 0]}>
      <primitive object={scene} scale={5} />
    </group>
  );
};

export default Avatar;
