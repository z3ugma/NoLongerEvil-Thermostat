const mqtt = require("mqtt");
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const options = {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  clientId: `no_longer_evil_server_${Math.random().toString(16).slice(2, 10)}`,
};

console.log(`[MQTT] Connecting to broker at ${MQTT_BROKER_URL}...`);

const client = mqtt.connect(MQTT_BROKER_URL, options);

client.on("error", (err) => {
  console.error("[MQTT] Connection error:", err.message);
});

client.on("reconnect", () => {
  console.log("[MQTT] Reconnecting...");
});

client.on("connect", () => {
  console.log("[MQTT] Successfully connected to broker.");

  const commandTopics = [
    "nest/+/mode_set",
    "nest/+/temperature_set",
    "nest/+/target_temperature_low_set",
    "nest/+/target_temperature_high_set",
    "nest/+/fan_mode_set",
    "nest/+/away_mode_set",
  ];

  client.subscribe(commandTopics, (err) => {
    if (err) {
      console.error("[MQTT] Failed to subscribe to command topics:", err);
    } else {
      console.log(
        `[MQTT] Subscribed to ${commandTopics.length} command topics.`
      );
    }
  });
});

module.exports = client;
