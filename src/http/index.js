import express from "express";
import { createServer } from "http";
import { attachClientSettings, forwardToIdcCore, forwardWSToIdcCore } from "./middleware.js";
import { jwks_controller, ping_controller } from "./controllers.js";
import cors from "cors";

const app = express();

// HTTP Server
const http = createServer(app);

// Websocket Proxying
http.on("upgrade", forwardWSToIdcCore);

// Middleware
app.use(cors());
app.use("/socket.io", attachClientSettings, forwardToIdcCore)
// END Middleware

// Routes
app.get("/jwks.json", jwks_controller);
app.get("/ping/gateway", ping_controller);
app.get("/ping", attachClientSettings, forwardToIdcCore);
app.post("/task", attachClientSettings, forwardToIdcCore);
app.post("/action", attachClientSettings, forwardToIdcCore);
// END More Routes




// // Proxy normal HTTP requests for socket.io polling transports
// app.use("/socket.io", (req, res) => {
//   const key = req.headers["x-target-key"];
//   const target = primaryTargets[key] || primaryTargets.serviceA;

//   console.log(`[Gateway] HTTP routing to: ${target}`);

//   // Extract auth token and rewrite header
//   const token = req.headers["authorization"] || req.headers["sec-websocket-protocol"];
//   if (token) {
//     req.headers["authorization"] = `Bearer ${token.replace(/^Bearer\s*/i, "")}`;
//   }

//   proxy.web(req, res, { target });
// });

// // Proxy WebSocket upgrade requests
// server.on("upgrade", (req, socket, head) => {
//   const key = req.headers["x-target-key"];
//   const target = primaryTargets[key] || primaryTargets.serviceA;

//   console.log(`[Gateway] WS routing to: ${target}`);

//   // Rewrite auth similarly
//   const token = req.headers["authorization"] || req.headers["sec-websocket-protocol"];
//   if (token) {
//     req.headers["authorization"] = `Bearer ${token.replace(/^Bearer\s*/i, "")}`;
//   }

//   proxy.ws(req, socket, head, { target });
// });



export default http;
