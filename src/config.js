import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { exportJWK, importSPKI } from "jose";
dotenv.config({
  quiet: true,
});

/**
 * @type {object}
 * @property {object} jwk - The JSON Web Key
 * @property {Array} jwks - The JSON Web Key Set
 * @property {string} key_id - The Key ID
 * @property {string} public - The public key in PEM format
 * @property {string} private - The private key in PEM format
 */
const jwt_keys = {};

try {
  jwt_keys.jwks = [];

  const public_key = fs.readFileSync(path.resolve("src/keys/public.pem"), "utf8");
  const private_key = fs.readFileSync(path.resolve("src/keys/private.pem"), "utf8");

  const key_obj = await importSPKI(public_key, "RS256");
  jwt_keys.jwk = await exportJWK(key_obj);
  jwt_keys.jwk.kid = "idc-gateway-" + Math.random().toString(36).substring(2, 15);
  jwt_keys.jwk.use = "sig";
  jwt_keys.jwk.alg = "RS256";

  jwt_keys.jwks.push(jwt_keys.jwk);

  jwt_keys.key_id = jwt_keys.jwk.kid;
  jwt_keys.public = public_key;
  jwt_keys.private = private_key;
} catch (err) {
  console.error("🔴 - JWT keys loading failed:", err);
  process.exit(1);
}

export default {
  idc_gateway: {
    url: process.env.IDC_GATEWAY_URL,
  },
  idc_core: {
    url: process.env.IDC_CORE_URL,
    client_id: process.env.IDC_CLIENT_ID,
  },
  http: {
    port: process.env.HTTP_PORT,
  },
  jwt_keys,
};
