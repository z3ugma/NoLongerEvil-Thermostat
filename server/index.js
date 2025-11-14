require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mqttClient = require("./lib/mqttClient"); // Replaced convex
const SERVER_STATUS_TOPIC = mqttClient.SERVER_STATUS_TOPIC;
const PROXY_PORT = Number(process.env.PROXY_PORT || 443);
const CONTROL_PORT = Number(process.env.CONTROL_PORT || 8081);
const ENTRY_KEY_TTL_SECONDS = Number.isFinite(
  Number(process.env.ENTRY_KEY_TTL_SECONDS)
)
  ? Number(process.env.ENTRY_KEY_TTL_SECONDS)
  : 3600;
const DEFAULT_API_ORIGIN = "https://backdoor.nolongerevil.com";
const API_ORIGIN = (process.env.API_ORIGIN || DEFAULT_API_ORIGIN).replace(
  /\/+$/,
  ""
);

global.nestDeviceState = {};
global.activeUsers = {};
global.pendingSubscribes = {};
global.discoveredDevices = new Set();

let initialStateLoaded = false;
// Re-open the state loading window every time we connect to the broker
mqttClient.on('connect', () => {
  console.log('[SYSTEM] MQTT connection established. Opening state loading window for 5 seconds.');
  initialStateLoaded = false;
});

mqttClient.on('state_loaded', () => {
  initialStateLoaded = true;
});

// Listen for incoming MQTT messages to rehydrate state on startup from retained topics
mqttClient.on('message', (topic, payload) => {
  // Only process retained state messages during the initial startup window
  if (initialStateLoaded) {
    return;
  }

  try {
    const topicParts = topic.split('/');
    if (topicParts.length === 3 && topicParts[0] === 'nest' && topicParts[2] === 'state') {
      const serial = topicParts[1];
      const stateObject = JSON.parse(payload.toString());

      if (serial && stateObject && stateObject.object_key) {
        if (!global.nestDeviceState[serial]) {
          global.nestDeviceState[serial] = {};
        }
        
        // Restore the full state object into the in-memory cache
        global.nestDeviceState[serial][stateObject.object_key] = stateObject;

        console.log(`[STATE RECOVERY] Hydrated state for ${serial} from MQTT topic: ${topic}`);
      }
    }
  } catch (err) {
    console.error(`[MQTT] Error processing retained state message on topic ${topic}:`, err.message);
  }
});

function extractSerialFromAuthHeader(header) {
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const username = decoded.split(":")[0] || "";
    const parts = username.split(".");
    if (parts.length > 1) {
      const serial = String(parts[1])
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      return serial.length >= 10 ? serial : null;
    }
    const cleaned = String(username)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    return cleaned.length >= 10 ? cleaned : null;
  } catch {
    return null;
  }
}

function resolveDeviceSerial(req) {
  const headers = req.headers || {};

  const authSerial = extractSerialFromAuthHeader(headers.authorization);
  if (authSerial) return authSerial;

  const headerSerial = headers["x-nl-device-serial"];

  if (headerSerial) {
    const cleaned = String(headerSerial)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (cleaned.length >= 10) return cleaned;
  }

  return null;
}

function generateEntryKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < 7; i++) {
    key += chars[crypto.randomInt(0, chars.length)];
  }
  return key;
}

function getDeviceTopics(serial) {
  const baseTopic = `nest/${serial}`;
  return {
    // (Server -> HA)
    mode_state: `${baseTopic}/mode_state`,
    temp_state: `${baseTopic}/temperature_state`,
    temp_low_state: `${baseTopic}/target_temperature_low_state`,
    temp_high_state: `${baseTopic}/target_temperature_high_state`,
    current_temp_state: `${baseTopic}/current_temperature_state`,
    fan_mode_state: `${baseTopic}/fan_mode_state`,
    away_mode_state: `${baseTopic}/away_mode_state`,
    availability: `${baseTopic}/availability`,

    // (HA -> Server)
    mode_set: `${baseTopic}/mode_set`,
    temp_set: `${baseTopic}/temperature_set`,
    temp_low_set: `${baseTopic}/target_temperature_low_set`,
    temp_high_set: `${baseTopic}/target_temperature_high_set`,
    fan_mode_set: `${baseTopic}/fan_mode_set`,
    away_mode_set: `${baseTopic}/away_mode_set`,
  };
}

function publishHADiscovery(serial) {
  if (!serial || global.discoveredDevices.has(serial)) {
    return; // Already discovered
  }

  const topics = getDeviceTopics(serial);
  const discoveryTopic = `homeassistant/climate/nest_${serial}/config`;

  const discoveryPayload = {
    name: `Nest ${serial.slice(-6)}`,
    unique_id: `nest_${serial}`,
    device: {
      identifiers: [`nest_${serial}`],
      name: `Nest Thermostat ${serial}`,
      manufacturer: "NoLongerEvil (Nest)",
      model: "Thermostat",
    },

    mode_state_topic: topics.mode_state,
    mode_command_topic: topics.mode_set,
    modes: ["off", "heat", "cool", "heat_cool"],

    temperature_state_topic: topics.temp_state,
    temperature_command_topic: topics.temp_set,

    target_temp_low_state_topic: topics.temp_low_state,
    target_temp_low_command_topic: topics.temp_low_set,

    target_temp_high_state_topic: topics.temp_high_state,
    target_temp_high_command_topic: topics.temp_high_set,

    current_temperature_topic: topics.current_temp_state,

    fan_mode_state_topic: topics.fan_mode_state,
    fan_mode_command_topic: topics.fan_mode_set,
    fan_modes: ["on", "auto"],

    away_mode_state_topic: topics.away_mode_state,
    away_mode_command_topic: topics.away_mode_set,
    payload_on: "on",
    payload_off: "off",

    
    availability_topic: SERVER_STATUS_TOPIC,
    payload_available: "online",
    payload_not_available: "offline",

    temperature_unit: "C",
  };

  try {
    mqttClient.publish(discoveryTopic, JSON.stringify(discoveryPayload), {
      retain: true,
    });
    mqttClient.publish(topics.availability, "online", { retain: true });
    global.discoveredDevices.add(serial);
    console.log(`[MQTT] Published HA Discovery for ${serial}`);
  } catch (err) {
    console.error(
      `[MQTT] Failed to publish HA Discovery for ${serial}:`,
      err.message
    );
  }
}

function persistStateToMqtt(serial, stateObject) {
  if (!serial || !stateObject || !stateObject.object_key) return;

  const stateTopic = `nest/${serial}/state`;
  try {
    mqttClient.publish(stateTopic, JSON.stringify(stateObject), { retain: true });
  } catch (err) {
    console.error(`[MQTT] Failed to persist state for ${serial} to ${stateTopic}:`, err.message);
  }
}

function publishMqttState(serial, deviceValue) {
  if (!serial || !deviceValue) return;

  const topics = getDeviceTopics(serial);

  const publish = (topic, value) => {
    if (value !== undefined && value !== null) {
      mqttClient.publish(topic, String(value), { retain: true });
    }
  };

  try {
    // Nest2MQTT
    console.log(
      `TARGET TEMPERATURETPYE: ${deviceValue.target_temperature_type}`
    );

    if (deviceValue.target_temperature_type) {
      let hvacMode = deviceValue.target_temperature_type;
      if (hvacMode == "range") {
        hvacMode = "heat_cool";
      }
      publish(topics.mode_state, hvacMode);
    }

    publish(topics.temp_state, deviceValue.target_temperature);
    publish(topics.temp_low_state, deviceValue.target_temperature_low);
    publish(topics.temp_high_state, deviceValue.target_temperature_high);
    publish(topics.current_temp_state, deviceValue.current_temperature);
    publish(topics.fan_mode_state, deviceValue.fan_mode);

    // Nest uses 2/0 for auto_away?
    if (deviceValue.auto_away !== undefined) {
      publish(
        topics.away_mode_state,
        deviceValue.auto_away === 2 ? "on" : "off"
      );
    }
  } catch (err) {
    console.error(`[MQTT] Failed to publish state for ${serial}:`, err.message);
  }
}

function notifyStateChange(serial, changedObjectKey, updatedObject) {
  if (
    !global.pendingSubscribes[serial] ||
    global.pendingSubscribes[serial].length === 0
  ) {
    return;
  }

  const subscribes = global.pendingSubscribes[serial];
  global.pendingSubscribes[serial] = [];

  for (const subscribe of subscribes) {
    try {
      if (subscribe.res.writableEnded || subscribe.res.destroyed) {
        continue;
      }

      const watchingObject = subscribe.objects.find(
        (obj) => obj.object_key === changedObjectKey
      );

      if (watchingObject) {
        const updateResponse =
          JSON.stringify({
            objects: [
              {
                object_revision: updatedObject.object_revision,
                object_timestamp: updatedObject.object_timestamp,
                object_key: updatedObject.object_key,
                value: updatedObject.value,
              },
            ],
          }) + "\r\n";

        subscribe.res.write(updateResponse);
        subscribe.res.end();
      } else {
        if (!subscribe.res.writableEnded && !subscribe.res.destroyed) {
          global.pendingSubscribes[serial] =
            global.pendingSubscribes[serial] || [];
          global.pendingSubscribes[serial].push(subscribe);
        }
      }
    } catch (err) {
      console.error("[NOTIFY] Failed to notify subscriber:", err.message);
    }
  }
}

async function handleTransportSubscribe(req, res, bodyBuffer) {
  const serial = resolveDeviceSerial(req);

  let requestBody;
  try {
    requestBody = JSON.parse(bodyBuffer.toString("utf8"));
  } catch (e) {
    console.error("[TRANSPORT] Failed to parse subscribe body:", e.message);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const sessionId = requestBody.session || `session_${serial}_${Date.now()}`;
  const objects = requestBody.objects || [];
  const timestamp = Date.now();

  if (serial && !global.nestDeviceState[serial]) {
    global.nestDeviceState[serial] = {};
  }

  if (serial) {
    publishHADiscovery(serial); // first contact

    const weaveDeviceId = req.headers["x-nl-weave-device-id"];
    if (weaveDeviceId) {
      const deviceObjectKey = `device.${serial}`;
      const existingDevice = global.nestDeviceState[serial][deviceObjectKey];
      const existingValue = existingDevice?.value || {};

      if (
        !existingValue.weave_device_id ||
        existingValue.weave_device_id !== weaveDeviceId
      ) {
        const mergedValue = {
          ...existingValue,
          weave_device_id: weaveDeviceId,
        };
        const newRevision = (existingDevice?.object_revision || 0) + 1;

        global.nestDeviceState[serial][deviceObjectKey] = {
          object_key: deviceObjectKey,
          object_revision: newRevision,
          object_timestamp: timestamp,
          value: mergedValue,
        };
        persistStateToMqtt(serial, global.nestDeviceState[serial][deviceObjectKey]);
        console.log(
          `[STATE UPDATE] Serial=${serial} Key=${deviceObjectKey}`,
          JSON.stringify(mergedValue, null, 2)
        );

        publishMqttState(serial, mergedValue);
      }
    }
  }

  const responseObjects = await Promise.all(
    objects.map(async (obj) => {
      const objectKey = obj.object_key;
      const nowMillis = timestamp;

      if (!serial) {
        return {
          object_key: objectKey,
          object_revision: 0,
          object_timestamp: nowMillis,
          value: {},
        };
      }

      let stored = global.nestDeviceState[serial]?.[objectKey];

      const isUpdate =
        obj.value &&
        (obj.object_revision === undefined || obj.object_revision === 0) &&
        (obj.object_timestamp === undefined || obj.object_timestamp === 0);

      if (isUpdate) {
        const existingValue = stored?.value || {};
        const mergedValue = { ...existingValue, ...obj.value };
        const newRevision = (stored?.object_revision || 0) + 1;
        const newTimestamp = nowMillis;

        stored = {
          object_key: objectKey,
          object_revision: newRevision,
          object_timestamp: newTimestamp,
          value: mergedValue,
        };

        global.nestDeviceState[serial][objectKey] = stored;
        persistStateToMqtt(serial, stored);

        console.log(
          `[STATE UPDATE] Serial=${serial} Key=${objectKey}`,
          JSON.stringify(stored.value, null, 2)
        );

        publishMqttState(serial, mergedValue);
      }

      return {
        object_revision: stored?.object_revision || 0,
        object_timestamp: stored?.object_timestamp || nowMillis,
        object_key: objectKey,
        value: stored?.value || {},
      };
    })
  );

  const outdatedObjects = [];
  const objectsToMerge = [];

  for (let i = 0; i < objects.length; i++) {
    const deviceObj = objects[i];
    const ourObj = responseObjects[i];

    if (deviceObj.object_revision === 0 && deviceObj.object_timestamp === 0) {
      outdatedObjects.push(ourObj);
      continue;
    }

    const ourRevisionHigher =
      ourObj.object_revision > deviceObj.object_revision;
    const ourTimestampHigher =
      ourObj.object_timestamp > deviceObj.object_timestamp;

    if (ourRevisionHigher || ourTimestampHigher) {
      outdatedObjects.push(ourObj);
    } else if (
      deviceObj.object_revision > ourObj.object_revision ||
      deviceObj.object_timestamp > ourObj.object_timestamp
    ) {
      objectsToMerge.push({ deviceObj, ourObj });
    }
  }

  for (const { deviceObj, ourObj } of objectsToMerge) {
    const objectKey = deviceObj.object_key;

    const mergedValue = deviceObj.value
      ? { ...ourObj.value, ...deviceObj.value }
      : ourObj.value;

    const updated = {
      object_key: objectKey,
      object_revision: deviceObj.object_revision,
      object_timestamp: deviceObj.object_timestamp,
      value: mergedValue,
    };

    global.nestDeviceState[serial][objectKey] = updated;
    persistStateToMqtt(serial, updated);

    console.log(
      `[STATE UPDATE] Serial=${serial} Key=${objectKey}`,
      JSON.stringify(updated.value, null, 2)
    );

    publishMqttState(serial, mergedValue);
  }

  if (outdatedObjects.length > 0) {
    const response = JSON.stringify({
      objects: outdatedObjects,
    });

    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=UTF-8",
        "X-nl-service-timestamp": Date.now().toString(),
      });
    }
    res.end(response);
    return;
  }

  if (!serial) {
    res.end();
    return;
  }

  if (!global.pendingSubscribes[serial]) {
    global.pendingSubscribes[serial] = [];
  }

  const subscribeInfo = {
    res: res,
    objects: objects,
    sessionId: sessionId,
    connectedAt: Date.now(),
  };

  global.pendingSubscribes[serial].push(subscribeInfo);

  req.on("close", () => {
    if (global.pendingSubscribes[serial]) {
      global.pendingSubscribes[serial] = global.pendingSubscribes[
        serial
      ].filter((sub) => sub.res !== res);
    }
  });
}

async function handlePut(req, res, bodyBuffer) {
  const serial = resolveDeviceSerial(req);

  let requestBody;
  try {
    requestBody = JSON.parse(bodyBuffer.toString("utf8"));
    console.log(
      `[PUT PAYLOAD] Serial=${serial || "UNKNOWN"}`,
      JSON.stringify(requestBody, null, 2)
    );
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const objects = requestBody.objects || [];
  const requestTimestamp = Date.now();

  if (serial) {
    publishHADiscovery(serial); // first contact

    if (!global.nestDeviceState[serial]) {
      global.nestDeviceState[serial] = {};
    }

    const weaveDeviceId = req.headers["x-nl-weave-device-id"];
    if (weaveDeviceId) {
      const deviceObjectKey = `device.${serial}`;
      const existingDevice = global.nestDeviceState[serial][deviceObjectKey];
      const existingValue = existingDevice?.value || {};

      if (
        !existingValue.weave_device_id ||
        existingValue.weave_device_id !== weaveDeviceId
      ) {
        const mergedValue = {
          ...existingValue,
          weave_device_id: weaveDeviceId,
        };
        const newRevision = (existingDevice?.object_revision || 0) + 1;

        global.nestDeviceState[serial][deviceObjectKey] = {
          object_key: deviceObjectKey,
          object_revision: newRevision,
          object_timestamp: requestTimestamp,
          value: mergedValue,
        };
        persistStateToMqtt(serial, global.nestDeviceState[serial][deviceObjectKey]);

        console.log(
          `[STATE UPDATE] Serial=${serial} Key=${deviceObjectKey}`,
          JSON.stringify(mergedValue, null, 2)
        );

        publishMqttState(serial, mergedValue);
      }
    }

    for (const obj of objects) {
      if (obj.object_key) {
        const objectKey = obj.object_key;
        const nowMillis = requestTimestamp;

        let existingState = global.nestDeviceState[serial][objectKey];
        let existingValue = existingState?.value || {};

        const mergedValue = { ...existingValue, ...(obj.value || {}) };

        if (objectKey === `device.${serial}`) {
          const existingTimeout = existingValue.fan_timer_timeout || 0;
          const nowSeconds = Math.floor(Date.now() / 1000);

          if (existingTimeout > nowSeconds) {
            mergedValue.fan_timer_timeout = existingTimeout;
            mergedValue.fan_control_state = existingValue.fan_control_state;
            mergedValue.fan_timer_duration = existingValue.fan_timer_duration;
            mergedValue.fan_current_speed = existingValue.fan_current_speed;
            mergedValue.fan_mode = existingValue.fan_mode;
          }
        }

        let valuesChanged = false;
        for (const [key, newVal] of Object.entries(obj.value || {})) {
          const oldVal = existingValue[key];
          if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
            valuesChanged = true;
          }
        }

        if (valuesChanged) {
          const newRevision = (existingState?.object_revision || 0) + 1;
          const newTimestamp = nowMillis;

          global.nestDeviceState[serial][objectKey] = {
            object_key: objectKey,
            object_revision: newRevision,
            object_timestamp: newTimestamp,
            value: mergedValue,
          };
          persistStateToMqtt(serial, global.nestDeviceState[serial][objectKey]);

          console.log(
            `[STATE UPDATE] Serial=${serial} Key=${objectKey}`,
            JSON.stringify(mergedValue, null, 2)
          );

          publishMqttState(serial, mergedValue);
        }
      }
    }
  }

  const responseObjects = objects.map((obj) => {
    const objectKey = obj.object_key;
    const stored = serial ? global.nestDeviceState[serial]?.[objectKey] : null;

    let valuesChanged = false;
    const existingValue = stored?.value || {};
    for (const [key, newVal] of Object.entries(obj.value || {})) {
      const oldVal = existingValue[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        valuesChanged = true;
        break;
      }
    }

    const response = {
      object_revision: stored?.object_revision || 0,
      object_timestamp: stored?.object_timestamp || Date.now(),
      object_key: objectKey,
    };

    if (valuesChanged) {
      response.value = stored?.value || {};
    }

    return response;
  });

  const response = { objects: responseObjects };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(response));

  if (
    serial &&
    global.pendingSubscribes[serial] &&
    global.pendingSubscribes[serial].length > 0
  ) {
    const subscribes = global.pendingSubscribes[serial];
    global.pendingSubscribes[serial] = [];

    for (const subscribe of subscribes) {
      try {
        if (subscribe.res.writableEnded || subscribe.res.destroyed) {
          continue;
        }

        const subscribeResponse =
          JSON.stringify({ objects: responseObjects }) + "\r\n";

        subscribe.res.write(subscribeResponse);
        subscribe.res.end();
      } catch (err) {
        console.error("[PUT] Failed to end subscription:", err.message);
      }
    }
  }
}

const server = http.createServer(async (req, res) => {
  res.on("finish", () => {
    console.log(`[API] ${req.method} ${req.url} ${res.statusCode}`);
  });

  const method = req.method;
  const url = req.url;

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const bodyBuffer = Buffer.concat(chunks);
    const bodyStr = bodyBuffer.toString("utf8");

    try {
      if (url.includes("/entry")) {
        const serial = resolveDeviceSerial(req);
        const baseUrl = API_ORIGIN;

        const response = {
          czfe_url: `${baseUrl}/nest/transport`,
          transport_url: `${baseUrl}/nest/transport`,
          direct_transport_url: `${baseUrl}/nest/transport`,
          passphrase_url: `${baseUrl}/nest/passphrase`,
          ping_url: `${baseUrl}/nest/transport`,
          pro_info_url: `${baseUrl}/nest/pro_info`,
          weather_url: `${baseUrl}/nest/weather/v1?query=`,
          upload_url: `${baseUrl}/nest/upload`,
          software_update_url: "",
          server_version: "1.0.0",
          tier_name: "local",
        };

        const responseStr = JSON.stringify(response);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(responseStr);
        return;
      }

      if (url.includes("/passphrase")) {
        const serial = resolveDeviceSerial(req);

        let entryKey = null;
        let expiresTimestamp =
          Math.floor(Date.now() / 1000) +
          Math.floor(ENTRY_KEY_TTL_SECONDS / 1000);

        if (!entryKey) {
          entryKey = generateEntryKey();
        }

        const response = {
          value: entryKey,
          expires: expiresTimestamp,
        };

        const responseStr = JSON.stringify(response);

        console.log(
          `[PASSPHRASE] Serial=${serial || "UNKNOWN"} key=${entryKey.slice(0, 3)}-${entryKey.slice(3)}`
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(responseStr);
        return;
      }

      if (url.includes("/nest/weather") || url.includes("/weather/v1")) {
        console.log(`[WEATHER] Request: ${url}`);

        const urlObj = new URL(url, `https://${req.headers.host}`);
        const query = urlObj.searchParams.get("query");

        if (!query) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing query parameter" }));
          return;
        }

        const parts = query.split(",");
        const postalCode = parts[0]?.trim();
        const country = parts[1]?.trim() || "US";

        if (!postalCode) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid query format" }));
          return;
        }

        console.log(`[WEATHER] Query: ${query}`);

        const isIpQuery =
          postalCode.toLowerCase() === "ipv4" ||
          postalCode.toLowerCase() === "ipv6";

        let weatherData = null;
        let needsFetch = true;

        if (needsFetch) {
          try {
            const weatherUrl = `https://weather.nest.com/weather/v1?query=${encodeURIComponent(query)}`;
            console.log(`[WEATHER] Fetching from: ${weatherUrl}`);

            const https = require("https");
            const fetchWeather = () =>
              new Promise((resolve, reject) => {
                const options = {
                  rejectUnauthorized: false,
                };
                https
                  .get(weatherUrl, options, (weatherRes) => {
                    let data = "";
                    weatherRes.on("data", (chunk) => (data += chunk));
                    weatherRes.on("end", () => {
                      if (weatherRes.statusCode === 200) {
                        try {
                          const parsed = JSON.parse(data);
                          resolve(parsed);
                        } catch (e) {
                          reject(new Error("Failed to parse weather response"));
                        }
                      } else {
                        reject(
                          new Error(
                            `Weather API returned ${weatherRes.statusCode}`
                          )
                        );
                      }
                    });
                  })
                  .on("error", reject);
              });

            weatherData = await fetchWeather();
            console.log(`[WEATHER] Fetched from API`);
          } catch (err) {
            console.error(`[WEATHER] Failed to fetch from API:`, err.message);
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Weather service unavailable" }));
            return;
          }
        }

        const responseStr = JSON.stringify(weatherData);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(responseStr);
        return;
      }

      if (url.includes("/transport") || url.includes("/czfe")) {
        if (method === "GET" && url.includes("/device/")) {
          const serial = resolveDeviceSerial(req);

          const objects = Object.values(
            global.nestDeviceState[serial] || {}
          ).map((obj) => ({
            object_revision: obj.object_revision,
            object_timestamp: obj.object_timestamp,
            object_key: obj.object_key,
          }));

          const response = { objects };
          const responseStr = JSON.stringify(response);

          const responseHeaders = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(responseStr, "utf8"),
          };

          res.writeHead(200, responseHeaders);
          res.end(responseStr);
          return;
        }

        let isSubscribe = false;
        try {
          const bodyObj = JSON.parse(bodyStr);
          isSubscribe = bodyObj.chunked === true;
        } catch {}

        if (method === "POST" && isSubscribe) {
          handleTransportSubscribe(req, res, bodyBuffer);
          return;
        }

        if (url.includes("/put") && method === "POST") {
          await handlePut(req, res, bodyBuffer);
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      if (url.includes("/pro_info") || url.includes("/pro-info")) {
        const urlParts = url.split("?");
        const queryString = urlParts[1] || "";
        const params = new URLSearchParams(queryString);
        const entryCode = params.get("code") || params.get("entry_code") || "";

        if (entryCode) {
          const response = JSON.stringify({
            [entryCode.toUpperCase()]: { pro: "not found" },
          });
          // logRequest(method, url, 200);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(response);
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing entry code" }));
        }
        return;
      }

      if (url.includes("/ping")) {
        const response = JSON.stringify({
          status: "ok",
          timestamp: Date.now(),
        });
        // logRequest(method, url, 200);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(response);
        return;
      }

      if (url.includes("/upload")) {
        // logRequest(method, url, 200);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }

      // logRequest(method, url, 404);
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    } catch (err) {
      console.error("[ERROR]", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`\n===========================================`);
  console.log(`No Longer Evil API running on port ${PROXY_PORT}`);
  console.log(`===========================================\n`);
});

server.on("error", (err) => {
  console.error("[SERVER ERROR]", err);
});

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendError(res, code, message) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: message }));
}

function sendJson(res, data) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleCommand(req, res) {
  try {
    const cmd = await parseJsonBody(req);
    const deviceSerial = cmd.serial?.trim();

    if (!deviceSerial) {
      return sendError(res, 400, "Missing device serial");
    }

    const action = cmd.action;
    const value = cmd.value;
    const mode = cmd.mode;

    console.log(
      `[API] Command received: ${action} ${value} for ${deviceSerial}`
    );

    global.activeUsers[deviceSerial] = Date.now();

    if (!global.nestDeviceState[deviceSerial]) {
      global.nestDeviceState[deviceSerial] = {};
    }

    let objectKey = null;
    let valueUpdate = null;

    switch (action) {
      case "temp":
      case "temperature": {
        objectKey = `shared.${deviceSerial}`;
        const record = global.nestDeviceState[deviceSerial][objectKey] || {
          value: {},
        };
        const tempValue = parseFloat(value);

        if (!isNaN(tempValue)) {
          const lowerSafety = record.value?.lower_safety_temp || 7.222;
          const upperSafety = record.value?.upper_safety_temp || 35.0;
          const clampedTemp = Math.max(
            lowerSafety,
            Math.min(upperSafety, tempValue)
          );

          valueUpdate = {
            target_temperature: clampedTemp,
            target_temperature_type: mode,
            touched_by: {
              touched_by: "nolongerevil",
              touched_where: "api",
              touched_source: "web",
              touched_when: Math.floor(Date.now() / 1000),
              touched_tzo: new Date().getTimezoneOffset() * -60,
              touched_id: 1,
            },
          };

          if (cmd.target_temperature_low !== undefined) {
            const lowTemp = parseFloat(cmd.target_temperature_low);
            if (!isNaN(lowTemp)) {
              const clampedLow = Math.max(
                lowerSafety,
                Math.min(upperSafety, lowTemp)
              );
              valueUpdate.target_temperature_low = clampedLow;
            }
          }

          if (cmd.target_temperature_high !== undefined) {
            const highTemp = parseFloat(cmd.target_temperature_high);
            if (!isNaN(highTemp)) {
              const clampedHigh = Math.max(
                lowerSafety,
                Math.min(upperSafety, highTemp)
              );
              valueUpdate.target_temperature_high = clampedHigh;
            }
          }

          if (cmd.target_change_pending !== undefined) {
            valueUpdate.target_change_pending = cmd.target_change_pending;
          }
        } else {
          return sendError(res, 400, "Invalid temperature value");
        }
        break;
      }

      case "away":
        objectKey = `shared.${deviceSerial}`;
        valueUpdate = { auto_away: value === "true" || value === "1" ? 2 : 0 };
        break;

      case "set": {
        objectKey = cmd.object || `shared.${deviceSerial}`;
        const field = cmd.field;
        if (!field) {
          return sendError(res, 400, "Missing field parameter for set action");
        }
        if (
          typeof cmd.value === "object" &&
          cmd.value !== null &&
          !Array.isArray(cmd.value)
        ) {
          valueUpdate = cmd.value;
        } else {
          valueUpdate = { [field]: cmd.value };
        }
        break;
      }

      default:
        return sendError(res, 400, `Unknown action: ${action}`);
    }

    if (!objectKey) {
      return sendError(res, 400, "Missing object key");
    }

    let storedObj = global.nestDeviceState[deviceSerial][objectKey];

    if (!storedObj) {
      storedObj = {
        object_revision: 0,
        object_timestamp: Date.now(),
        value: {},
      };
      global.nestDeviceState[deviceSerial][objectKey] = storedObj;
    }

    Object.assign(storedObj.value, valueUpdate);

    console.log(
      `[STATE UPDATE] Serial=${deviceSerial} Key=${objectKey}`,
      JSON.stringify(storedObj.value, null, 2)
    );

    const nowMs = Date.now();
    storedObj.object_revision = (storedObj.object_revision || 0) + 1;
    storedObj.object_timestamp = nowMs;

    console.log(
      `[STATE UPDATE] Serial=${deviceSerial} Key=${objectKey}`,
      JSON.stringify(storedObj.value, null, 2)
    );

    publishMqttState(deviceSerial, storedObj.value);

    notifyStateChange(deviceSerial, objectKey, {
      object_key: objectKey,
      object_revision: storedObj.object_revision,
      object_timestamp: storedObj.object_timestamp,
      value: storedObj.value,
    });

    sendJson(res, {
      success: true,
      message: "Command handled",
      device: deviceSerial,
      object: objectKey,
      revision: storedObj.object_revision,
      timestamp: storedObj.object_timestamp,
    });
  } catch (err) {
    console.error("[API] Command error:", err);
    sendError(res, 500, err.message);
  }
}

async function handleStatus(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://localhost:${CONTROL_PORT}`);
    const serialParam = parsedUrl.searchParams.get("serial");
    const allDevices = Object.keys(global.nestDeviceState);

    if (serialParam) {
      global.activeUsers[serialParam] = Date.now();
      console.log(`[STATUS] User marked active for device ${serialParam}`);
    }

    let devices = allDevices;
    let deviceState = global.nestDeviceState;

    if (serialParam) {
      if (!allDevices.includes(serialParam)) {
        devices = [];
        deviceState = {};
      } else {
        devices = [serialParam];
        deviceState = { [serialParam]: global.nestDeviceState[serialParam] };
      }
    }

    sendJson(res, { devices, deviceState });
  } catch (err) {
    sendError(res, 400, err.message);
  }
}

async function handleDevices(req, res) {
  const devices = Object.keys(global.nestDeviceState).map((serial) => ({
    serial,
    objects: Object.keys(global.nestDeviceState[serial]),
  }));
  sendJson(res, devices);
}

// MQTT STUFF
async function handleMqttCommand(serial, command, value) {
  console.log(`[MQTT] Command received: ${command} = ${value} for ${serial}`);

  if (!global.nestDeviceState[serial]) {
    console.warn(`[MQTT] Received command for unknown serial: ${serial}`);
    global.nestDeviceState[serial] = {};
  }

  const objectKey = `shared.${serial}`;
  let valueUpdate = {};

  switch (command) {
    case "mode_set":
      valueUpdate.hvac_mode = value;
      switch (value) {
        case "heat":
          valueUpdate.hvac_ac_state = false;
          valueUpdate.target_temperature_type = "heat";
          break;
        case "cool":
          valueUpdate.hvac_heater_state = false;
          valueUpdate.target_temperature_type = "cool";
          break;
        case "heat_cool":
          // valueUpdate.hvac_heater_state = true;
          valueUpdate.target_temperature_type = "range";
          break;
        case "off":
          valueUpdate.hvac_heater_state = false;
          valueUpdate.hvac_ac_state = false;
          valueUpdate.target_temperature_type = "off";
          break;
      }
      break;

    case "temperature_set":
      valueUpdate.target_temperature = parseFloat(value);
      // Try to preserve existing mode, default to 'heat'
      // valueUpdate.target_temperature_type =
      //   global.nestDeviceState[serial][objectKey]?.value?.hvac_mode || "heat";
      break;

    case "target_temperature_low_set":
      valueUpdate.target_temperature_low = parseFloat(value);
      valueUpdate.target_temperature_type = "heat_cool";
      break;

    case "target_temperature_high_set":
      valueUpdate.target_temperature_high = parseFloat(value);
      valueUpdate.target_temperature_type = "heat_cool";
      break;

    case "fan_mode_set":
      valueUpdate.fan_mode = value;
      break;

    case "away_mode_set":
      valueUpdate.auto_away = value === "on" ? 2 : 0;
      break;

    default:
      console.warn(`[MQTT] Unknown command: ${command}`);
      return;
  }

  valueUpdate.touched_by = {
    touched_by: "nolongerevil",
    touched_where: "api",
    touched_source: "mqtt",
    touched_when: Math.floor(Date.now() / 1000),
    touched_tzo: new Date().getTimezoneOffset() * -60,
    touched_id: 2, // Use a different ID from the API
  };

  let storedObj = global.nestDeviceState[serial][objectKey];
  if (!storedObj) {
    storedObj = {
      object_revision: 0,
      object_timestamp: 0,
      value: {},
    };
    global.nestDeviceState[serial][objectKey] = storedObj;
  }

  Object.assign(storedObj.value, valueUpdate);

  const nowMs = Date.now();
  storedObj.object_revision = (storedObj.object_revision || 0) + 1;
  storedObj.object_timestamp = nowMs;

  // Publish to MQTT
  publishMqttState(serial, storedObj.value);

  // Notify the physical device of the change
  notifyStateChange(serial, objectKey, {
    object_key: objectKey,
    object_revision: storedObj.object_revision,
    object_timestamp: storedObj.object_timestamp,
    value: storedObj.value,
  });
}

mqttClient.on("message", (topic, message) => {
  try {
    const parts = topic.split("/");
    if (parts.length < 3) return;

    const serial = parts[1];
    const command = parts[2];
    const value = message.toString();

    if (command.endsWith("_set")) {
      handleMqttCommand(serial, command, value);
    }
  } catch (err) {
    console.error("[MQTT] Error processing message:", err.message);
  }
});

const controlServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/command") {
    return handleCommand(req, res);
  }

  if (req.method === "GET" && req.url && req.url.startsWith("/status")) {
    return handleStatus(req, res);
  }

  if (req.url === "/api/devices") {
    return handleDevices(req, res);
  }

  sendError(res, 404, "Not Found");
});

controlServer.listen(CONTROL_PORT, () => {
  console.log(`Control API running on port ${CONTROL_PORT}`);
});
