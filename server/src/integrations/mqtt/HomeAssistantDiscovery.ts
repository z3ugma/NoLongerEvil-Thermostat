/**
 * Home Assistant MQTT Discovery
 *
 * Publishes discovery messages for automatic device detection in Home Assistant
 * Reference: https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery
 *
 * Discovery Topic Format:
 * <discovery_prefix>/<component>/[<node_id>/]<object_id>/config
 *
 * Example:
 * homeassistant/climate/nest_02AA01AC/thermostat/config
 */

import * as mqtt from 'mqtt';
import type { DeviceStateService } from '../../services/DeviceStateService';
import { resolveDeviceName, getDeviceTemperatureScale, nestModeToHA } from './helpers';

/**
 * Build Home Assistant discovery payload for climate entity (main thermostat control)
 */
export function buildClimateDiscovery(
  serial: string,
  deviceName: string,
  topicPrefix: string,
  temperatureUnit: 'C' | 'F',
  currentMode: string = 'off'
): any {
  const config: any = {
    // Unique identifier
    unique_id: `nolongerevil_${serial}`,

    // Device name
    name: deviceName,

    // Object ID (used for entity naming)
    object_id: `nest_${serial}`,

    // Device info (groups all entities together)
    device: {
      identifiers: [`nolongerevil_${serial}`],
      name: deviceName,
      model: 'Nest Thermostat',
      manufacturer: 'Google Nest',
      sw_version: 'NoLongerEvil',
    },

    // Availability topic
    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    // Temperature unit (user's preference)
    temperature_unit: temperatureUnit,

    // Precision (0.5 for Nest)
    precision: 0.5,
    temp_step: 0.5,

    // Current temperature
    current_temperature_topic: `${topicPrefix}/${serial}/ha/current_temperature`,

    // Current humidity
    current_humidity_topic: `${topicPrefix}/${serial}/ha/current_humidity`,
  };

  // Conditionally add temperature topics based on mode
  if (currentMode === 'heat_cool') {
    // Range mode: only include high/low temperature topics
    config.temperature_high_command_topic = `${topicPrefix}/${serial}/ha/target_temperature_high/set`;
    config.temperature_high_state_topic = `${topicPrefix}/${serial}/ha/target_temperature_high`;
    config.temperature_low_command_topic = `${topicPrefix}/${serial}/ha/target_temperature_low/set`;
    config.temperature_low_state_topic = `${topicPrefix}/${serial}/ha/target_temperature_low`;
  } else {
    // Heat/cool/off mode: only include single temperature topic
    config.temperature_command_topic = `${topicPrefix}/${serial}/ha/target_temperature/set`;
    config.temperature_state_topic = `${topicPrefix}/${serial}/ha/target_temperature`;
  }

  // Add remaining common config
  return {
    ...config,

    // HVAC mode (heat, cool, heat_cool, off)
    mode_command_topic: `${topicPrefix}/${serial}/ha/mode/set`,
    mode_state_topic: `${topicPrefix}/${serial}/ha/mode`,
    modes: ['off', 'heat', 'cool', 'heat_cool'],

    // HVAC action (heating, cooling, idle, fan, off)
    action_topic: `${topicPrefix}/${serial}/ha/action`,

    // Fan mode (on, auto)
    fan_mode_command_topic: `${topicPrefix}/${serial}/ha/fan_mode/set`,
    fan_mode_state_topic: `${topicPrefix}/${serial}/ha/fan_mode`,
    fan_modes: ['auto', 'on'],

    // Preset modes (home, away, eco)
    preset_mode_command_topic: `${topicPrefix}/${serial}/ha/preset/set`,
    preset_mode_state_topic: `${topicPrefix}/${serial}/ha/preset`,
    preset_modes: ['home', 'away', 'eco'],

    // Min/max temperature (typical Nest range in Celsius, HA will convert if needed)
    min_temp: temperatureUnit === 'C' ? 9 : 48,
    max_temp: temperatureUnit === 'C' ? 32 : 90,

    // Optimistic mode
    optimistic: false,

    // QoS
    qos: 1,
  };
}

/**
 * Build Home Assistant discovery payload for temperature sensor
 */
export function buildTemperatureSensorDiscovery(
  serial: string,
  topicPrefix: string,
  temperatureUnit: 'C' | 'F'
): any {
  return {
    unique_id: `nolongerevil_${serial}_temperature`,
    name: `Temperature`,
    object_id: `nest_${serial}_temperature`,

    device: {
      identifiers: [`nolongerevil_${serial}`],
    },

    state_topic: `${topicPrefix}/${serial}/ha/current_temperature`,
    unit_of_measurement: `°${temperatureUnit}`,
    device_class: 'temperature',
    state_class: 'measurement',

    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    qos: 0,
  };
}

/**
 * Build Home Assistant discovery payload for humidity sensor
 */
export function buildHumiditySensorDiscovery(
  serial: string,
  topicPrefix: string
): any {
  return {
    unique_id: `nolongerevil_${serial}_humidity`,
    name: `Humidity`,
    object_id: `nest_${serial}_humidity`,

    device: {
      identifiers: [`nolongerevil_${serial}`],
    },

    state_topic: `${topicPrefix}/${serial}/ha/current_humidity`,
    unit_of_measurement: '%',
    device_class: 'humidity',
    state_class: 'measurement',

    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    qos: 0,
  };
}

/**
 * Build Home Assistant discovery payload for outdoor temperature sensor
 */
export function buildOutdoorTemperatureSensorDiscovery(
  serial: string,
  topicPrefix: string,
  temperatureUnit: 'C' | 'F'
): any {
  return {
    unique_id: `nolongerevil_${serial}_outdoor_temperature`,
    name: `Outdoor Temperature`,
    object_id: `nest_${serial}_outdoor_temperature`,

    device: {
      identifiers: [`nolongerevil_${serial}`],
    },

    state_topic: `${topicPrefix}/${serial}/ha/outdoor_temperature`,
    unit_of_measurement: `°${temperatureUnit}`,
    device_class: 'temperature',
    state_class: 'measurement',

    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    qos: 0,
  };
}

/**
 * Build Home Assistant discovery payload for occupancy binary sensor
 */
export function buildOccupancyBinarySensorDiscovery(
  serial: string,
  topicPrefix: string
): any {
  return {
    unique_id: `nolongerevil_${serial}_occupancy`,
    name: `Occupancy`,
    object_id: `nest_${serial}_occupancy`,

    device: {
      identifiers: [`nolongerevil_${serial}`],
    },

    state_topic: `${topicPrefix}/${serial}/ha/occupancy`,
    payload_on: 'home',
    payload_off: 'away',
    device_class: 'occupancy',

    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    qos: 0,
  };
}


/**
 * Build Home Assistant discovery payload for fan binary sensor
 */
export function buildFanBinarySensorDiscovery(
  serial: string,
  topicPrefix: string
): any {
  return {
    unique_id: `nolongerevil_${serial}_fan`,
    name: `Fan`,
    object_id: `nest_${serial}_fan`,

    device: {
      identifiers: [`nolongerevil_${serial}`],
    },

    state_topic: `${topicPrefix}/${serial}/ha/fan_running`,
    payload_on: 'true',
    payload_off: 'false',
    device_class: 'running',

    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    qos: 0,
  };
}

/**
 * Build Home Assistant discovery payload for leaf (eco) binary sensor
 */
export function buildLeafBinarySensorDiscovery(
  serial: string,
  topicPrefix: string
): any {
  return {
    unique_id: `nolongerevil_${serial}_leaf`,
    name: `Eco Mode`,
    object_id: `nest_${serial}_leaf`,

    device: {
      identifiers: [`nolongerevil_${serial}`],
    },

    state_topic: `${topicPrefix}/${serial}/ha/eco`,
    payload_on: 'true',
    payload_off: 'false',
    device_class: 'power',

    availability: {
      topic: `${topicPrefix}/${serial}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },

    qos: 0,
  };
}

/**
 * Publish all discovery messages for a thermostat
 */
export async function publishThermostatDiscovery(
  client: mqtt.MqttClient,
  serial: string,
  deviceState: DeviceStateService,
  topicPrefix: string,
  discoveryPrefix: string
): Promise<void> {
  try {
    // Resolve device name and temperature scale
    const deviceName = await resolveDeviceName(serial, deviceState);
    const temperatureUnit = await getDeviceTemperatureScale(serial, deviceState);

    // Get current mode to conditionally build discovery payload
    const sharedObj = await deviceState.get(serial, `shared.${serial}`);
    const currentMode = nestModeToHA(sharedObj?.value?.target_temperature_type);

    console.log(`[HA Discovery] Publishing discovery for ${serial} (${deviceName}, ${temperatureUnit}, mode: ${currentMode})`);

    // Climate entity (main thermostat control)
    const climateConfig = buildClimateDiscovery(serial, deviceName, topicPrefix, temperatureUnit, currentMode);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/climate/nest_${serial}/thermostat/config`,
      climateConfig
    );

    // Temperature sensor
    const tempConfig = buildTemperatureSensorDiscovery(serial, topicPrefix, temperatureUnit);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/sensor/nest_${serial}/temperature/config`,
      tempConfig
    );

    // Humidity sensor
    const humidityConfig = buildHumiditySensorDiscovery(serial, topicPrefix);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/sensor/nest_${serial}/humidity/config`,
      humidityConfig
    );

    // Outdoor temperature sensor
    const outdoorTempConfig = buildOutdoorTemperatureSensorDiscovery(serial, topicPrefix, temperatureUnit);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/sensor/nest_${serial}/outdoor_temperature/config`,
      outdoorTempConfig
    );

    // Occupancy binary sensor
    const occupancyConfig = buildOccupancyBinarySensorDiscovery(serial, topicPrefix);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/binary_sensor/nest_${serial}/occupancy/config`,
      occupancyConfig
    );

    // Fan binary sensor
    const fanConfig = buildFanBinarySensorDiscovery(serial, topicPrefix);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/binary_sensor/nest_${serial}/fan/config`,
      fanConfig
    );

    // Leaf (eco) binary sensor
    const leafConfig = buildLeafBinarySensorDiscovery(serial, topicPrefix);
    await publishDiscoveryMessage(
      client,
      `${discoveryPrefix}/binary_sensor/nest_${serial}/leaf/config`,
      leafConfig
    );

    console.log(`[HA Discovery] Successfully published all discovery messages for ${serial}`);
  } catch (error) {
    console.error(`[HA Discovery] Error publishing discovery for ${serial}:`, error);
    throw error;
  }
}

/**
 * Publish a single discovery message (with error handling)
 */
async function publishDiscoveryMessage(
  client: mqtt.MqttClient,
  topic: string,
  config: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = typeof config === 'string' ? config : JSON.stringify(config);
    client.publish(topic, payload, { retain: true, qos: 1 }, (err) => {
      if (err) {
        console.error(`[HA Discovery] Failed to publish to ${topic}:`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Remove discovery messages for a device (when device is removed)
 */
export async function removeDeviceDiscovery(
  client: mqtt.MqttClient,
  serial: string,
  discoveryPrefix: string
): Promise<void> {
  const topics = [
    `${discoveryPrefix}/climate/nest_${serial}/thermostat/config`,
    `${discoveryPrefix}/sensor/nest_${serial}/temperature/config`,
    `${discoveryPrefix}/sensor/nest_${serial}/humidity/config`,
    `${discoveryPrefix}/sensor/nest_${serial}/outdoor_temperature/config`,
    `${discoveryPrefix}/binary_sensor/nest_${serial}/occupancy/config`,
    `${discoveryPrefix}/binary_sensor/nest_${serial}/fan/config`,
    `${discoveryPrefix}/binary_sensor/nest_${serial}/leaf/config`,
  ];

  // Publish empty payloads to remove entities
  for (const topic of topics) {
    await publishDiscoveryMessage(client, topic, '');
  }

  console.log(`[HA Discovery] Removed all discovery messages for ${serial}`);
}
