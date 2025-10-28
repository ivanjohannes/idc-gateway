import express from "express";
import { jwks_controller, ping_controller } from "./controllers.js";
import { attachClientSettings, forwardToIdcCore } from "./middleware.js";

const router = express.Router();

// ROUTES
router.get("/jwks.json", jwks_controller);
router.get("/ping/gateway", ping_controller);
router.get("/ping", attachClientSettings, forwardToIdcCore);
router.post("/task", attachClientSettings, forwardToIdcCore);
router.post("/action", attachClientSettings, forwardToIdcCore);
// END ROUTES

export default router;
