const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = process.env.PORT || 3000;
// when using middleware `hostname` and `port` must be provided below
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer(async (req, res) => {
        try {
            // Be sure to pass `true` as the second argument to `url.parse`.
            // This tells it to parse the query portion of the URL.
            const parsedUrl = parse(req.url, true);
            const { pathname, query } = parsedUrl;

            if (pathname.startsWith("/api/socket")) {
                console.log("⚠️ Socket request reached Next.js handler:", req.url);
            }

            if (pathname === "/a") {
                await app.render(req, res, "/a", query);
            } else if (pathname === "/b") {
                await app.render(req, res, "/b", query);
            } else {
                await handle(req, res, parsedUrl);
            }
        } catch (err) {
            console.error("Error occurred handling", req.url, err);
            res.statusCode = 500;
            res.end("internal server error");
        }
    });

    const io = new Server(httpServer, {
        path: "/api/socket",
        addTrailingSlash: false,
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log("Socket connected:", socket.id);

        socket.on("join-room", (roomId, userName, avatar) => {
            socket.join(roomId);
            socket.to(roomId).emit("user-connected", { userId: socket.id, userName, avatar });
            console.log(`User ${socket.id} (${userName}) joined room ${roomId} with avatar ${avatar}`);
        });

        socket.on("offer", (data) => {
            // data: { target, signal, callerName, callerAvatar }
            io.to(data.target).emit("offer", {
                signal: data.signal,
                callerId: socket.id,
                callerName: data.callerName,
                callerAvatar: data.callerAvatar
            });
        });

        socket.on("answer", (data) => {
            // data: { target, signal, senderName, senderAvatar }
            io.to(data.target).emit("answer", {
                signal: data.signal,
                senderId: socket.id,
                senderName: data.senderName,
                senderAvatar: data.senderAvatar
            });
        });

        socket.on("disconnecting", () => {
            const rooms = [...socket.rooms];
            rooms.forEach((roomId) => {
                socket.to(roomId).emit("user-disconnected", socket.id);
            });
        });

        socket.on("disconnect", () => {
            console.log("Socket disconnected:", socket.id);
        });
    });

    httpServer
        .once("error", (err) => {
            console.error(err);
            process.exit(1);
        })
        .listen(port, () => {
            console.log(`> Ready on http://${hostname}:${port}`);
        });
});
