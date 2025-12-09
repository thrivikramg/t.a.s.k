/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false, // strict mode can double-invoke effects, annoying for WebRTC/Three.js dev
};

module.exports = nextConfig;
