"use client";

import React, { useEffect, useRef } from 'react';
import { useFrame, useGraph, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { FaceLandmarkerResult, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface AvatarProps {
  faceResultRef?: React.MutableRefObject<FaceLandmarkerResult | null>;
  handResultRef?: React.MutableRefObject<HandLandmarkerResult | null>;
  url?: string;
  externalExpressions?: {
    blendshapes: Record<string, number>;
    rotation: number[] | null;
    handResult?: HandLandmarkerResult | null;
  };
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

export const Avatar: React.FC<AvatarProps> = ({ faceResultRef, handResultRef, url = '/avatar1.glb', externalExpressions }) => {
  const safeUrl = url.startsWith('/') || url.startsWith('http') ? url : `/${url}`;
  const { scene } = useGLTF(safeUrl);
  const { nodes } = useGraph(scene);
  const { camera } = useThree();

  // Head / eyes
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const spineBoneRef = useRef<THREE.Bone | null>(null);
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
    // 1. Find Bones (head, eyes, arms, spine)
    let head: any = (nodes as any).Head || (nodes as any).Neck || (nodes as any).head || (nodes as any).neck;
    let spine: any = (nodes as any).Spine || (nodes as any).Spine1 || (nodes as any).spine || (nodes as any).Hips;
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
        if (!spine && (/spine|hips/i).test(name)) spine = bone;
        if (!lEye && /eye.*l/i.test(name)) lEye = bone;
        if (!rEye && /eye.*r/i.test(name)) rEye = bone;

        if (!lArm && (/arm.*l/i.test(name) && !/fore/i.test(name))) lArm = bone;
        if (!rArm && (/arm.*r/i.test(name) && !/fore/i.test(name))) rArm = bone;
        if (!lForeArm && /fore.*l/i.test(name)) lForeArm = bone;
        if (!rForeArm && /fore.*r/i.test(name)) rForeArm = bone;
      }
    });

    if (head) headBoneRef.current = head as THREE.Bone;
    if (spine) spineBoneRef.current = spine as THREE.Bone;
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

    const faceResult = faceResultRef?.current;
    // Use external hand result if available, otherwise local
    const handResult = externalExpressions?.handResult || handResultRef?.current;

    // --- Face Tracking (Local or External) ---
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

        // Body movement (Spine follows head)
        if (spineBoneRef.current) {
          spineBoneRef.current.rotation.x = THREE.MathUtils.lerp(spineBoneRef.current.rotation.x, rotation.x * 0.3, damp);
          spineBoneRef.current.rotation.y = THREE.MathUtils.lerp(spineBoneRef.current.rotation.y, -rotation.y * 0.3, damp);
          spineBoneRef.current.rotation.z = THREE.MathUtils.lerp(spineBoneRef.current.rotation.z, -rotation.z * 0.3, damp);
        }
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
            let lerpFactor = 0.25; // Smoother blendshape transitions
            if (name.toLowerCase().includes('blink')) {
              finalScore = Math.min(1, score * 1.5);
              lerpFactor = 0.6; // Blinks need to be slightly faster but still smooth
            }
            if (name === 'jawOpen' || name === 'mouthOpen') {
              finalScore = Math.min(1, score * 2.5);
            }
            influences[index] = THREE.MathUtils.lerp(influences[index], finalScore, lerpFactor);
          }
        });
      });
    } else if (externalExpressions) {
      const { blendshapes: extBlendshapes, rotation } = externalExpressions;

      // Check for talking
      const jawOpen = extBlendshapes['jawOpen'] || 0;
      const mouthOpen = extBlendshapes['mouthOpen'] || 0;
      isTalking = jawOpen > 0.05 || mouthOpen > 0.05;

      // Head rotation - Increased damping for smoother movement
      if (rotation && headBoneRef.current) {
        const m = new THREE.Matrix4().fromArray(rotation);
        const eulerRotation = new THREE.Euler().setFromRotationMatrix(m);
        const damp = 0.4; // Increased for snappier movement
        headBoneRef.current.rotation.x = THREE.MathUtils.lerp(headBoneRef.current.rotation.x, eulerRotation.x, damp);
        headBoneRef.current.rotation.y = THREE.MathUtils.lerp(headBoneRef.current.rotation.y, -eulerRotation.y, damp);
        headBoneRef.current.rotation.z = THREE.MathUtils.lerp(headBoneRef.current.rotation.z, -eulerRotation.z, damp);

        // Body movement (Spine follows head)
        if (spineBoneRef.current) {
          spineBoneRef.current.rotation.x = THREE.MathUtils.lerp(spineBoneRef.current.rotation.x, eulerRotation.x * 0.3, damp);
          spineBoneRef.current.rotation.y = THREE.MathUtils.lerp(spineBoneRef.current.rotation.y, -eulerRotation.y * 0.3, damp);
          spineBoneRef.current.rotation.z = THREE.MathUtils.lerp(spineBoneRef.current.rotation.z, -eulerRotation.z * 0.3, damp);
        }
      }

      // Blendshapes to morph targets
      morphMeshes.current.forEach((mesh) => {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
        const dictionary = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;

        Object.entries(extBlendshapes).forEach(([name, score]) => {
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
            let lerpFactor = 0.5; // Faster blendshape transitions
            if (name.toLowerCase().includes('blink')) {
              finalScore = Math.min(1, score * 1.5);
              lerpFactor = 0.8; // Blinks need to be fast
            }
            if (name === 'jawOpen' || name === 'mouthOpen') {
              finalScore = Math.min(1, score * 2.5);
            }
            influences[index] = THREE.MathUtils.lerp(influences[index], finalScore, lerpFactor);
          }
        });
      });
    }

    // --- Hand Tracking & Gestures ---
    const time = state.clock.elapsedTime;

    // Base Pose (Relaxed)
    const baseLeftArmZ = -0.3;
    const baseRightArmZ = 0.3;
    const baseArmX = 1.0;
    const baseForeArmX = 2.2;

    // Idle Breathing
    const breathSpeed = 1.5;
    const breathAmp = 0.02;
    const breath = Math.sin(time * breathSpeed) * breathAmp;

    let targetLeftArmZ = baseLeftArmZ + breath;
    let targetLeftArmX = baseArmX;
    let targetRightArmZ = baseRightArmZ - breath;
    let targetRightArmX = baseArmX;

    let targetLeftForeArmX = baseForeArmX;
    let targetRightForeArmX = baseForeArmX;

    // Check for Hand Tracking Data
    let isTrackingHands = false;
    if (handResult && handResult.landmarks && handResult.landmarks.length > 0) {
      isTrackingHands = true;

      // Iterate through detected hands
      handResult.handedness.forEach((hand, index) => {
        const landmarks = handResult.landmarks[index];
        const label = hand[0].categoryName; // "Left" or "Right"
        const score = hand[0].score;

        if (score > 0.5) {
          const wrist = landmarks[0];

          // Improved Mapping for Natural Movement
          // MediaPipe Coordinates: X (0-1), Y (0-1)

          if (label === "Right") {
            // User's Right Hand -> Avatar's Left Arm (Mirror Mode)
            // X: 0 (Cross body) -> 1 (Outstretched)

            // Shoulder Z (Side-to-side): 
            // 1 (Right side of screen) -> Arm Out (-0.5)
            // 0 (Left side of screen) -> Arm Across (1.5)
            targetLeftArmZ = THREE.MathUtils.mapLinear(wrist.x, 0, 1, 1.5, -0.5);

            // Shoulder X (Up/Down):
            // Y: 0 (Top) -> 1 (Bottom)
            // 0 -> Arm Up (-1.0)
            // 1 -> Arm Down (1.5)
            targetLeftArmX = THREE.MathUtils.mapLinear(wrist.y, 0, 1, -1.0, 1.5);

            // Elbow (Forearm Bend):
            // Bend elbow when hand is high or close to body
            // Simple heuristic: Higher hand (y -> 0) = More bend
            targetLeftForeArmX = THREE.MathUtils.mapLinear(wrist.y, 0, 1, 2.2, 0.2);

          } else {
            // User's Left Hand -> Avatar's Right Arm (Mirror Mode)
            // X: 0 (Outstretched) -> 1 (Cross body)

            // Shoulder Z (Side-to-side):
            // 0 (Left side of screen) -> Arm Out (0.5)
            // 1 (Right side of screen) -> Arm Across (-1.5)
            targetRightArmZ = THREE.MathUtils.mapLinear(wrist.x, 0, 1, 0.5, -1.5);

            // Shoulder X (Up/Down):
            targetRightArmX = THREE.MathUtils.mapLinear(wrist.y, 0, 1, -1.0, 1.5);

            // Elbow (Forearm Bend):
            targetRightForeArmX = THREE.MathUtils.mapLinear(wrist.y, 0, 1, 2.2, 0.2);
          }
        }
      });
    }

    // Fallback to Talking Gestures if not tracking hands
    if (!isTrackingHands && isTalking) {
      const speed = 5;
      const amp = 0.1;

      targetLeftArmZ += Math.sin(time * speed) * amp;
      targetRightArmZ += Math.cos(time * speed * 0.8) * amp;
      targetLeftArmX += Math.sin(time * speed * 0.5) * (amp * 0.5);
      targetRightArmX += Math.cos(time * speed * 0.6) * (amp * 0.5);

      const gestureForeArm = Math.sin(time * speed * 1.2) * 0.15;
      targetLeftForeArmX += gestureForeArm;
      targetRightForeArmX += gestureForeArm;
    }

    const damp = 0.1;

    if (leftArmRef.current) {
      leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetLeftArmZ, damp);
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetLeftArmX, damp);
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetRightArmZ, damp);
      rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRightArmX, damp);
    }

    if (leftForeArmRef.current) {
      leftForeArmRef.current.rotation.x = THREE.MathUtils.lerp(leftForeArmRef.current.rotation.x, targetLeftForeArmX, damp);
    }

    if (rightForeArmRef.current) {
      rightForeArmRef.current.rotation.x = THREE.MathUtils.lerp(rightForeArmRef.current.rotation.x, targetRightForeArmX, damp);
    }
  });

  return (
    <primitive object={scene} />
  );
};


export default Avatar;
