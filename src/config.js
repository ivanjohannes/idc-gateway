import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { exportJWK, importSPKI } from "jose";
dotenv.config({
  quiet: true,
});

const public_key = fs.readFileSync(path.resolve("src/keys/public.pem"), "utf8");
const private_key = fs.readFileSync(path.resolve("src/keys/private.pem"), "utf8");

const jwks = [];

const key_obj = await importSPKI(public_key, "RS256");
const jwk = await exportJWK(key_obj);
jwk.kid = "idc-gateway-" + Math.random().toString(36).substring(2, 15);
jwk.use = "sig";
jwk.alg = "RS256";

jwks.push(jwk);

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
  jwt_keys: {
    key_id: jwk.kid,
    public: public_key,
    private: private_key,
    jwks: jwks,
  },
};
