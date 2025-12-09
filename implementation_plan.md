# AR Video Call MVP Implementation Plan

## Goal
Create a real-time AR video call application where users are represented by animated 3D avatars controlled by their face movements.

## Proposed Changes

### Core Setup
- [NEW] Initialize Next.js 14 project (App Router, TypeScript).
- [NEW] Install dependencies: `three`, `@react-three/fiber`, `@react-three/drei`, `@mediapipe/tasks-vision`, `simple-peer` (or `socket.io-client` + raw WebRTC), `socket.io`.

### 3D & AR (Client-Side)
- [NEW] `components/ar/Scene.tsx`: Main R3F Canvas.
- [NEW] `components/ar/FaceTracker.tsx`: Manages MediaPipe FaceLandmarker.
- [NEW] `components/ar/Avatar.tsx`: **Procedural 3D Avatar**.
    - Since we cannot generate a rigged GLB file from scratch, we will procedurally generate a humanoid avatar using Three.js primitives (Spheres, Capsules).
    - It will have a Head, Eyes (with pupils), and Mouth.
    - **Animation**: Map MediaPipe blendshapes/matrix to the avatar's transforms.
- [NEW] `hooks/useFaceTracking.ts`: Custom hook to initialize and consume MediaPipe results.

### Video Call Logic
- [NEW] `lib/webrtc.ts`: WebRTC utility functions (peer connection, stream handling).
- [NEW] `components/call/VideoRoom.tsx`: Manages the call state and renders local/remote streams.
    - **Streaming**: Capture the R3F Canvas stream (`canvas.captureStream()`) and send it via WebRTC.
    - **Rendering**: Render the remote stream into a `<video>` element (or a texture on a plane in 3D if we want full immersion, but `<video>` is safer for MVP).

### Backend (Signaling)
- [NEW] `pages/api/socket.ts` (or custom server): Socket.io signaling server for WebRTC discovery.
    - *Note*: Next.js App Router doesn't support persistent WebSockets easily in API routes. We might need a custom server `server.js` or use a separate signaling service. For MVP, we'll try to use a custom `server.ts` with `ts-node` or just a separate Node process if needed, but `pages/api/socket` with a custom server entry point is the standard Next.js workaround.

### UI/UX
- [NEW] `app/page.tsx`: Landing page to start/join call.
- [NEW] `app/room/[id]/page.tsx`: The video call room.
- [NEW] `styles/globals.css`: Custom CSS for "Premium" look (Glassmorphism, dark mode).

## Verification Plan

### Automated Tests
- None for this MVP (visual/interactive nature makes unit testing hard).

### Manual Verification
1.  **Local AR Test**:
    - Open app, grant camera permission.
    - Verify "Procedural Avatar" appears and follows head movement (rotation, mouth open/close, eye blink).
2.  **Call Test**:
    - Open two browser windows (or devices on same network).
    - Join same room.
    - Verify video stream is the *Avatar*, not the camera.
    - Verify audio is transmitted.
