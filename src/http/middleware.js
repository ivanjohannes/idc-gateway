import jwt from "jsonwebtoken";
import config from "../config.js";
import { createProxyMiddleware } from "http-proxy-middleware";
import mongodb_client from "../mongodb/index.js";

export async function attachClientSettings(req, res, next) {
  try {
    const bearer_token = req.headers["authorization"];
    const api_key = bearer_token?.split(" ")[1];

    const client_document = await mongodb_client.db(config.mongodb.db_name).collection("clients").findOne({ api_key });

    if (!client_document) {
      throw "client not recognized";
    }

    const client_settings = client_document.settings || {};

    req.client_settings = client_settings;
  } finally {
    next();
  }
}

export function forwardToIdcCore(req, res, next) {
  const client_settings = req.client_settings;

  if (!client_settings?.client_id) {
    return res.status(401).json({ error: "Client not recognized" });
  }

  if (!client_settings.idc_core_url) {
    return res.status(400).json({ error: "No IDC Core URL configured for client" });
  }

  const jwt_token = jwt.sign(
    {
      sub: client_settings.client_id,
      client_settings,
    },
    config.jwt_keys.private,
    {
      algorithm: "RS256",
      expiresIn: "10m",
      issuer: config.idc_gateway.url,
      keyid: config.jwt_keys.key_id,
    }
  );

  createProxyMiddleware({
    target: client_settings.idc_core_url,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader("Authorization", `Bearer ${jwt_token}`);
      },
    },
  })(req, res, next);
}
