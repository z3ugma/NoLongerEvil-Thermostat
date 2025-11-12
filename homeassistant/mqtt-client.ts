import mqtt, { MqttClient } from "mqtt";
import * as config from "./mqtt-discovery-config";
import { getDevices, updateDevice, DeviceState } from "./persistence";
import eventManager from "./event-manager";

// Define the shape of commands we expect from MQTT
interface CommandPayload {
  mode?: 'heat' | 'cool' | 'heat_cool' | 'off';
  target_temperature?: number;
  target_temperature_low?: number;
  target_temperature_high?: number;
}

export class MQTTClient {
  private client: MqttClient | null = null;
  private connected: boolean = false;
  private subscribedSerials: Set<string> = new Set();

  async initialize() {
    await this.connect();
    this.listenForEvents();

    // Initialize any devices that already exist in the database on startup
    const existingDevices = getDevices();
    console.log(`[MQTT] Initializing ${Object.keys(existingDevices).length} devices from database...`);
    for (const serial in existingDevices) {
      this.onlineDevice(existingDevices[serial]);
    }
  }

  private listenForEvents() {
    eventManager.on('device:updated', ({ oldState, newState }: { oldState?: DeviceState, newState: DeviceState }) => {
      console.log(`[MQTT] Received device:updated event for ${newState.serial}`);
      this.onlineDevice(newState);

      // The core logic: republish discovery only if the mode has changed.
      const oldMode = oldState?.state.mode;
      const newMode = newState.state.mode;

      if (oldMode !== newMode) {
        console.log(`[MQTT] Mode changed for ${newState.serial} (${oldMode} -> ${newMode}). Republishing discovery.`);
        this.publishDiscovery(newState);
      }

      this.publishState(newState);
    });

    eventManager.on('device:deleted', ({ serial }: { serial: string }) => {
      console.log(`[MQTT] Received device:deleted event for ${serial}`);
      this.offlineDevice(serial);
    });
  }

  private async handleCommand(serial: string, command: CommandPayload) {
    console.log(`[MQTT COMMAND] Received command for ${serial}:`, JSON.stringify(command));
    
    // The single source of truth for current state is the database
    const devices = getDevices();
    const device = devices[serial];

    if (!device) {
        console.warn(`[MQTT COMMAND] Received command for unknown/deleted device: ${serial}`);
        return;
    }

    // Apply changes to the current state
    const newState = { ...device, state: { ...device.state, ...command } };

    // The ONLY responsibility of handleCommand is to persist the change.
    // The 'device:updated' event will trigger all other actions.
    await updateDevice(serial, newState);
  }

  private onlineDevice(device: DeviceState) {
    if (!this.subscribedSerials.has(device.serial)) {
        console.log(`\n[MQTT] --- Bringing device ${device.serial} online ---`);
        this.subscribeToCommands(device);
        this.subscribedSerials.add(device.serial);
    }
    this.publishDiscovery(device);
    this.publishState(device);
  }

  private offlineDevice(serial: string) {
    console.log(`\n[MQTT] --- Taking device ${serial} offline ---`);
    if (!this.connected || !this.client) return;

    // Unsubscribe from command topics
    const commandTopic = config.getCommandTopic(serial);
    this.client.unsubscribe(commandTopic);
    this.subscribedSerials.delete(serial);
    
    // To remove the entity from Home Assistant, we publish an empty payload
    // to its discovery topic.
    const discoveryTopic = config.getDiscoveryTopic(serial);
    this.client.publish(discoveryTopic, '', { retain: true });
  }

  private getConfig() {
    const host = process.env.MQTT_HOST || "localhost";
    const port = process.env.MQTT_PORT || '1883';
    const username = process.env.MQTT_USER || "";
    const password = process.env.MQTT_PASSWORD || "";

    return { host, port: parseInt(port, 10), username, password };
  }

  private async connect() {
    const mqttConfig = this.getConfig();
    const options = {
      clientId: `nolongerevil_${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      username: mqttConfig.username,
      password: mqttConfig.password,
    };

    const brokerUrl = `mqtt://${mqttConfig.host}:${mqttConfig.port}`;
    console.log(`[MQTT] Connecting to broker: ${brokerUrl}`);
    this.client = mqtt.connect(brokerUrl, options);

    this.client.on("connect", () => this._onConnect());
    this.client.on("message", (topic, message) => this._onMessage(topic, message));
    this.client.on("error", (err) => this._onError(err));
    this.client.on("close", () => this._onClose());
    this.client.on("reconnect", () => this._onReconnect());

    return new Promise<void>((resolve) => {
      this.client?.once("connect", () => {
        this.connected = true;
        resolve();
      });
    });
  }

  private publishDiscovery(device: DeviceState) {
    if (!this.connected || !this.client) return;
    const topic = config.getDiscoveryTopic(device.serial);
    const payload = config.buildDiscoveryPayload(device);
    this.client.publish(topic, JSON.stringify(payload), { retain: true });
    console.log(`[MQTT] > Published discovery for ${device.serial}`);
  }

  private publishState(device: DeviceState) {
    if (!this.connected || !this.client) return;
    const topic = config.getStateTopic(device.serial);
    const payload = config.buildStatePayload(device);
    this.client.publish(topic, JSON.stringify(payload), { retain: true });
    console.log(`[MQTT] > Published state for ${device.serial}`);
  }

  private subscribeToCommands(device: DeviceState) {
    if (!this.connected || !this.client) return;
    const commandTopic = config.getCommandTopic(device.serial);
    this.client.subscribe(commandTopic);
    console.log(`[MQTT] Subscribed to commands for ${device.serial} on ${commandTopic}`);
  }

  private _onConnect() {
    console.log("[MQTT] ✓ Connected successfully\n");
    this.connected = true;
  }

  private _onMessage(topic: string, message: Buffer) {
    console.log(`\n[MQTT] ← Received message on topic: ${topic}`);
    console.log(`[MQTT]   Payload: ${message.toString()}`);

    // Extract serial from topic, e.g., homeassistant/climate/nolongerevil_SERIAL/set
    const match = topic.match(/nolongerevil_([a-zA-Z0-9]+)/);
    if (match && match[1]) {
      const serial = match[1];
      try {
        const command = JSON.parse(message.toString());
        this.handleCommand(serial, command);
      } catch (error) {
        console.error(`[MQTT] Failed to parse command:`, error);
      }
    }
  }

  private _onError(err: Error) {
    console.error("[MQTT] Connection error:", err);
  }

  private _onClose() {
    console.log("[MQTT] Connection closed");
    this.connected = false;
  }

  private _onReconnect() {
    console.log("[MQTT] Reconnecting...");
  }
}
