import express from "express";
import { jwks_controller, ping_controller } from "./controllers.js";
import { attachClientSettings, forwardToIdcCore } from "./middleware.js";

const router = express.Router();

// MIDDLEWARE
router.use(attachClientSettings);
// END MIDDLEWARE

// ROUTES
router.get("/jwks.json", jwks_controller);
router.get("/ping/gateway", ping_controller);
router.get("/ping", forwardToIdcCore);
router.post("/task", forwardToIdcCore);
router.post("/action", forwardToIdcCore);
// END ROUTES

export default router;
