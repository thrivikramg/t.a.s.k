import { useEffect, useRef, useState } from "react";
import {
    FaceLandmarker,
    HandLandmarker,
    FilesetResolver,
    FaceLandmarkerResult,
    HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export const useFaceTracking = () => {
    const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(null);
    const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);

    // Use refs for results to avoid triggering re-renders every frame
    const faceResultRef = useRef<FaceLandmarkerResult | null>(null);
    const handResultRef = useRef<HandLandmarkerResult | null>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const requestRef = useRef<number>();
    const [stream, setStream] = useState<MediaStream | null>(null);

    useEffect(() => {
        const initLandmarkers = async () => {
            const filesetResolver = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
            );

            const face = await FaceLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                    delegate: "GPU",
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: "VIDEO",
                numFaces: 1,
            });
            setFaceLandmarker(face);

            const hand = await HandLandmarker.createFromOptions(filesetResolver, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "GPU",
                },
                runningMode: "VIDEO",
                numHands: 2,
            });
            setHandLandmarker(hand);
        };

        initLandmarkers();
    }, []);

    const predictWebcam = () => {
        if (!faceLandmarker || !handLandmarker || !videoRef.current) return;

        // Only detect if video is playing and has data
        if (videoRef.current.videoWidth > 0 && !videoRef.current.paused) {
            const startTimeMs = performance.now();
            try {
                const fResult = faceLandmarker.detectForVideo(videoRef.current, startTimeMs);
                faceResultRef.current = fResult;

                const hResult = handLandmarker.detectForVideo(videoRef.current, startTimeMs);
                handResultRef.current = hResult;
            } catch (e) {
                console.error("Tracking error:", e);
            }
        }
        requestRef.current = requestAnimationFrame(predictWebcam);
    };

    const startTracking = async () => {
        if (!faceLandmarker || !handLandmarker) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true,
            });

            // Wait for video ref to be available if it's null
            const assignStream = () => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    setStream(stream);
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play().catch(e => console.error("Play error:", e));
                        predictWebcam();
                    };
                } else {
                    requestAnimationFrame(assignStream);
                }
            };
            assignStream();

        } catch (err) {
            console.error("Error accessing webcam:", err);
        }
    };

    useEffect(() => {
        if (faceLandmarker && handLandmarker) {
            startTracking();
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            // Stop stream
            if (videoRef.current && videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [faceLandmarker, handLandmarker]);

    return { videoRef, faceResultRef, handResultRef, stream };
};

