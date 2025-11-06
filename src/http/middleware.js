import jwt from "jsonwebtoken";
import config from "../config.js";
import httpProxy from "http-proxy";
import jwksClient from "jwks-rsa";

const jwks_clients = {};

const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });

async function getClientSettings(api_key, token) {
  let client_settings;
  try {
    if (api_key) {
      // identify the client by the provided api key
      const jwt_token = clientSettingsJwt({
        client_id: config.idc_gateway_core.client_id,
      });

      const core_response = await fetch(`${config.idc_gateway_core.url}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt_token}`,
        },
        body: JSON.stringify({
          action_definition: {
            tasks_definitions: {
              generate_hash: {
                function: "string_to_hash",
                params: {
                  unhashed_string: api_key || "",
                },
                is_secret_task_definition: true,
                is_secret_task_results: true,
              },
              get_client: {
                function: "aggregation",
                params: {
                  collection_name: "clients",
                  pipeline: [
                    {
                      $match: {
                        api_key_hash: "{{tasks_results.generate_hash.hashed_string}}",
                      },
                    },
                    {
                      $limit: 1,
                    },
                    {
                      $project: {
                        _id: 0,
                        settings: 1,
                      },
                    },
                    {
                      $lookup: {
                        from: "environments",
                        localField: "settings.environment_idc_id",
                        foreignField: "idc_id",
                        as: "environment",
                      },
                    },
                    {
                      $unwind: {
                        path: "$environment",
                        preserveNullAndEmptyArrays: true,
                      },
                    },
                  ],
                },
                is_secret_task_definition: true,
              },
            },
          },
        }),
      });

      const core_result = await core_response.json();

      const client_document = core_result.tasks_results?.get_client?.data?.[0];

      if (!client_document) {
        throw "client not recognized";
      }

      client_settings = {
        ...client_document.settings,
        environment_settings: client_document.environment?.settings || {},
      };
    } else if (token) {
      // get the client_id from the sub claim in the token
      const decoded_token = jwt.decode(token);

      if (!decoded_token?.sub) {
        throw "invalid token provided";
      }

      const client_id = decoded_token.sub;

      const jwt_token = clientSettingsJwt({
        client_id: config.idc_gateway_core.client_id,
      });

      const core_response = await fetch(`${config.idc_gateway_core.url}/action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt_token}`,
        },
        body: JSON.stringify({
          action_definition: {
            tasks_definitions: {
              get_client: {
                function: "aggregation",
                params: {
                  collection_name: "clients",
                  pipeline: [
                    {
                      $match: {
                        "settings.client_id": client_id,
                      },
                    },
                    {
                      $limit: 1,
                    },
                    {
                      $project: {
                        _id: 0,
                        settings: 1,
                      },
                    },
                    {
                      $lookup: {
                        from: "environments",
                        localField: "settings.environment_idc_id",
                        foreignField: "idc_id",
                        as: "environment",
                      },
                    },
                    {
                      $unwind: {
                        path: "$environment",
                        preserveNullAndEmptyArrays: true,
                      },
                    },
                  ],
                },
                is_secret_task_definition: true,
              },
            },
          },
        }),
      });

      const core_result = await core_response.json();

      const client_document = core_result.tasks_results?.get_client?.data?.[0];

      if (!client_document) {
        throw "client not recognized";
      }

      // validate the jwt
      const environment_idc_id = client_document.settings?.environment_idc_id;

      if (!jwks_clients[environment_idc_id]) {
        jwks_clients[environment_idc_id] = jwksClient({
          jwksUri: `${client_document.environment?.settings?.idc_core_url}/jwks.json`,
        });
      }

      const verified_token = await new Promise((resolve, reject) => {
        jwt.verify(token, getPublicKey(environment_idc_id), { algorithms: ["RS256"] }, (err, decoded) => {
          if (err) return reject(err);
          resolve(decoded);
        });
      });

      client_settings = {
        ...client_document.settings,
        environment_settings: client_document.environment?.settings || {},
      };
    } else {
      throw "no api key or token provided";
    }
  } catch (err) {
  } finally {
    return client_settings;
  }
}

function getPublicKey(environment_idc_id) {
  return function (header, callback) {
    jwks_clients[environment_idc_id].getSigningKey(header.kid, function (err, key) {
      if (err) return callback(err);
      const signingKey = key.getPublicKey();
      callback(null, signingKey);
    });
  };
}

export async function forwardToIdcCore(req, res, next) {
  const bearer_token = req.headers["authorization"];
  const api_key = bearer_token?.split(" ")[1];
  const token = req.query.token;
  const client_settings = await getClientSettings(api_key, token);
  req.client_settings = client_settings;

  if (!client_settings?.client_id) {
    return res.status(401).json({ error: "Client not recognized" });
  }

  if (!client_settings.environment_settings.idc_core_url) {
    return res.status(400).json({ error: "No IDC Core URL configured for client" });
  }

  const jwt_token = clientSettingsJwt(client_settings);
  const target = client_settings.environment_settings.idc_core_url;

  proxy.web(
    req,
    res,
    {
      target,
      headers: {
        Authorization: `Bearer ${jwt_token}`,
      },
    },
    (err) => {
      if (err) {
        console.error(`🔴 - HTTP Proxy Error:`, err);
        res.writeHead(502);
        res.end("Bad Gateway");
      }
    }
  );
}

export async function forwardWSToIdcCore(req, socket, head) {
  console.log("🔵 - WS upgrade request received");

  const search_params = new URLSearchParams(req.url.split("?")[1]);
  const token = search_params.get("token");

  const client_settings = await getClientSettings(null, token);
  req.client_settings = client_settings;

  if (!client_settings?.client_id) {
    socket.destroy();
    return;
  }

  if (!client_settings.environment_settings.idc_core_url) {
    socket.destroy();
    return;
  }

  const jwt_token = clientSettingsJwt(client_settings);

  proxy.ws(
    req,
    socket,
    head,
    {
      target: client_settings.environment_settings.idc_core_url,
      headers: {
        Authorization: `Bearer ${jwt_token}`,
      },
    },
    (err) => {
      if (err) {
        console.error(`🔴 - WS Proxy Error:`, err);
        socket.destroy();
      }
    }
  );
}

function clientSettingsJwt(client_settings) {
  return jwt.sign(
    {
      sub: client_settings.client_id,
      client_settings,
    },
    config.jwt_keys.private,
    {
      algorithm: "RS256",
      expiresIn: "2m",
      issuer: config.idc_gateway.url,
      keyid: config.jwt_keys.key_id,
    }
  );
}
