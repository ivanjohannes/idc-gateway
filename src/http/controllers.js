import config from "../config.js";

export async function ping_controller(req, res) {
  try {
    console.log("🟢 - Ping received");

    res.status(200).send("idc-gateway is alive!");
  } catch (err) {
    console.error("🔴 - Error occurred in ping_controller:", err);
    res.status(500).json({ error: err.message });
  }
}

export async function jwks_controller(req, res) {
  try {
    console.log("🟢 - JWKS request received");

    res.json({ keys: config.jwt_keys.jwks });
  } catch (err) {
    console.error("🔴 - Error occurred in jwks_controller:", err);
    res.status(500).json({ error: err.message });
  }
}
