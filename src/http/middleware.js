import jwt from "jsonwebtoken";
import config from "../config.js";
import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true });

/**
 * @description Fetch client settings from Core based on API key or client ID
 * @param {string} [api_key]
 * @param {string} [client_id]
 * @returns {Promise<Object|undefined>} Client settings or undefined if not found
 */
async function getClientSettings(api_key, client_id) {
  const gateway_token = clientSettingsJwt({
    client_id: "idc-gateway",
  });

  let client_document;

  if (api_key) {
    const core_response = await fetch(`${config.idc_gateway_core.url}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gateway_token}`,
      },
      body: JSON.stringify({
        action_definition: {
          tasks_definitions: {
            generate_hash: {
              function: "util_string_to_hash",
              params: {
                unhashed_string: api_key || "",
              },
              is_secret_task_definition: true,
              is_secret_task_results: true,
            },
            get_client: {
              function: "mongodb_aggregation",
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

    client_document = core_result.tasks_results?.get_client?.data?.[0];
  } else if (client_id) {
    const core_response = await fetch(`${config.idc_gateway_core.url}/action`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gateway_token}`,
      },
      body: JSON.stringify({
        action_definition: {
          tasks_definitions: {
            get_client: {
              function: "mongodb_aggregation",
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

    client_document = core_result.tasks_results?.get_client?.data?.[0];
  }

  if (!client_document) return;

  return {
    ...client_document?.settings,
    environment_settings: client_document?.environment?.settings || {},
  };
}

export async function forwardWSHandshakeToCore(req, res, next) {
  const is_socket_handshake = req.path.startsWith("/socket.io/");
  if (!is_socket_handshake) return next();

  const client_id = req.query.client_id;

  const client_settings = await getClientSettings(null, client_id);

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

export async function forwardToCore(req, res, next) {
  const bearer_token = req.headers["authorization"];
  const api_key = bearer_token?.split(" ")[1];
  const client_settings = await getClientSettings(api_key);
  
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

export async function forwardWSToCore(req, socket, head) {
  const search_params = new URLSearchParams(req.url.split("?")[1]);
  const client_id = search_params.get("client_id");

  const client_settings = await getClientSettings(null, client_id);
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
