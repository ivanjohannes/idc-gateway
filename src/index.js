import config from "./config.js";
import http_app from "./http/index.js";
import mongodb_client from "./mongodb/index.js";

console.log("🟡 - idc-gateway starting");

// MongoDB connection
if (config.mongodb.url) {
  await mongodb_client
    .connect()
    .then(() => {
      console.log("🟢 - MongoDB connected");
    })
    .catch((err) => {
      console.error(`🔴 - MongoDB failed to connect:`, err);
      process.exit(1);
    });
} else {
  console.error("🔴 - MONGODB_CLIENT_URL is not defined in the environment variables.");
  process.exit(1);
}
// END MongoDB connection

// HTTP server
if (config.http.port) {
  await new Promise((resolve) => {
    http_app.listen(config.http.port, (err) => {
      if (err) {
        console.error(`🔴 - HTTP failed to start:`, err);
        process.exit(1);
      }
      console.log(`🟢 - HTTP listening on port ${config.http.port}`);
      resolve();
    });
  });
} else {
  console.error("🔴 - HTTP_PORT is not defined in the environment variables.");
  process.exit(1);
}
// END HTTP server

console.log("🟢 - idc-gateway started");
