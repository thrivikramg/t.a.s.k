"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function ComingSoon() {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zinc-950 text-white relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px]" />
            </div>

            <div className="z-10 w-full max-w-3xl flex flex-col items-center text-center gap-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 mb-4">
                        Coming Soon
                    </h1>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    className="space-y-4"
                >
                    <p className="text-xl md:text-2xl text-zinc-300 font-light">
                        Please wait till the site is completed.
                    </p>
                    <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                        This is just a beta version which is under deployment. Sorry for your inconvenience.
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="mt-8"
                >
                    <Link
                        href="/"
                        className="px-8 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur-sm transition-all duration-300 text-white font-medium flex items-center gap-2 group"
                    >
                        <span>←</span>
                        <span>Return Home</span>
                    </Link>
                </motion.div>
            </div>
        </main>
    );
}
