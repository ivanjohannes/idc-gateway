import jwt from "jsonwebtoken";
import config from "../config.js";
import { createProxyMiddleware } from "http-proxy-middleware";

export async function attachClientSettings(req, res, next) {
  try {
    const bearer_token = req.headers["authorization"];
    const api_key = bearer_token?.split(" ")[1];

    // The bare minimum to find the client in the idc-gateway environment
    const jwt_token = clientSettingsJwt({
      client_id: config.idc_core.client_id,
    });

    const core_response = await fetch(`${config.idc_core.url}/action`, {
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

    const client_settings = client_document.settings || {};

    req.client_settings = {
      ...client_settings,
      environment_settings: client_document.environment?.settings || {},
    };
  } finally {
    next();
  }
}

export function forwardToIdcCore(req, res, next) {
  const client_settings = req.client_settings;

  if (!client_settings?.client_id) {
    return res.status(401).json({ error: "Client not recognized" });
  }

  if (!client_settings.environment_settings.idc_core_url) {
    return res.status(400).json({ error: "No IDC Core URL configured for client" });
  }

  const jwt_token = clientSettingsJwt(client_settings);

  createProxyMiddleware({
    target: client_settings.environment_settings.idc_core_url,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req, res) => {
        proxyReq.setHeader("Authorization", `Bearer ${jwt_token}`);
      },
    },
  })(req, res, next);
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
