const mqtt = require("mqtt");
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });

// Get broker URL and credentials from your .env file
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL;
const MQTT_USERNAME = process.env.MQTT_USERNAME;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

// Define the global server status topic for LWT
const SERVER_STATUS_TOPIC = 'nest/server/status'; 

const options = {
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  clientId: `no_longer_evil_server_${Math.random().toString(16).slice(2, 10)}`,
  
  // === LAST WILL AND TESTAMENT (LWT) CONFIGURATION ===
  will: {
    topic: SERVER_STATUS_TOPIC,
    payload: 'offline', // The message to send if the server disconnects unexpectedly
    qos: 1,
    retain: true // Broker will keep this message until the client reconnects
  }
  // =================================================
};

console.log(`[MQTT] Connecting to broker at ${MQTT_BROKER_URL}...`);

const client = mqtt.connect(MQTT_BROKER_URL, options);

client.on("error", (err) => {
  console.error("[MQTT] Connection error:", err.message);
});

client.on("reconnect", () => {
  console.log("[MQTT] Reconnecting...");
});

client.on('connect', () => {
  console.log('[MQTT] Successfully connected to broker.');
  
  // 1. Publish the "online" status (this overwrites the 'offline' LWT)
  client.publish(SERVER_STATUS_TOPIC, 'online', { qos: 1, retain: true });

  // 2. Subscribe to all command topics
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
// Export the topic so index.js can use it in the discovery payload
module.exports.SERVER_STATUS_TOPIC = SERVER_STATUS_TOPIC;
