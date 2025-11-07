import express from "express";
import { forwardWSHandshakeToCore, forwardToCore, forwardWSToCore } from "./middleware.js";
import { jwks_controller, ping_controller } from "./controllers.js";
import cors from "cors";
import { createServer } from "http";

const app = express();

// Global Middleware
app.use(cors());
// END Global Middleware

// Gateway Routes
app.get("/jwks.json", jwks_controller);
app.get("/ping/gateway", ping_controller);
// End Gateway Routes

// Handle Socket.IO initial handshake
app.use(forwardWSHandshakeToCore)

// Forward everything to Core
app.use(forwardToCore);

// HTTP Server
const http = createServer(app);

// Websocket Proxying
http.on("upgrade", forwardWSToCore);

export default http;
