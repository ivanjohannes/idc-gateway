import express from "express";
import { forwardToIdcCore, forwardWSToIdcCore } from "./middleware.js";
import { jwks_controller, ping_controller } from "./controllers.js";
import cors from "cors";
import { createServer } from "http";

const app = express();

// Middleware
app.use(cors());
// END Middleware

// Routes
app.get("/jwks.json", jwks_controller);
app.get("/ping/gateway", ping_controller);
// End Routes

// More Middleware
app.use(forwardToIdcCore);
// END More Middleware

// HTTP Server
const http = createServer(app);

// Websocket Proxying
http.on("upgrade", forwardWSToIdcCore);

export default http;
