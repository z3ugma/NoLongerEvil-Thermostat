/**
 * MQTT Discovery Configuration Module
 *
 * Contains ONLY constants and payload structure export functions.
 * No logic, no state management, just data structures.
 */

// Re-usable type for our device state
interface DeviceState {
    serial: string;
    name: string;
    manufacturer: string;
    model: string;
    state: {
        mode: 'heat' | 'cool' | 'heat_cool' | 'off';
        current_temperature: number;
        target_temperature?: number;
        target_temperature_low?: number;
        target_temperature_high?: number;
        action: 'heating' | 'cooling' | 'idle';
        is_online: boolean;
    };
}

// Type for the HA Discovery Payload
interface DiscoveryPayload {
    name: string;
    unique_id: string;
    device: {
        identifiers: string[];
        name: string;
        manufacturer: string;
        model: string;
    };
    state_topic: string;
    current_temperature_topic: string;
    mode_state_topic: string;
    action_topic: string;
    current_temperature_template: string;
    mode_state_template: string;
    action_template: string;
    precision: number;
    temperature_unit: string;
    modes: string[];
    availability_topic: string;
    availability_template: string;
    // Dynamic fields
    temperature_low_state_topic?: string;
    temperature_high_state_topic?: string;
    temperature_low_command_topic?: string;
    temperature_high_command_topic?: string;
    temperature_low_command_template?: string;
    temperature_high_command_template?: string;
    temperature_low_state_template?: string;
    temperature_high_state_template?: string;
    temperature_state_topic?: string;
    temperature_command_topic?: string;
    temperature_command_template?: string;
    temperature_state_template?: string;
    mode_command_topic?: string;
    mode_command_template?: string;
}

// Type for the State Payload
interface StatePayload {
    mode: 'heat' | 'cool' | 'heat_cool' | 'off';
    current_temperature: number;
    action: 'heating' | 'cooling' | 'idle';
    is_online: boolean;
    target_temperature_low?: number;
    target_temperature_high?: number;
    target_temperature?: number;
}


// Discovery prefix for Home Assistant MQTT
export const DISCOVERY_PREFIX = "homeassistant";
export const DEVICE_PREFIX = "nolongerevil";

// ============================================================================
// TOPIC HELPERS
// ============================================================================

export function getBaseTopic(serial: string): string {
  return `${DISCOVERY_PREFIX}/climate/${DEVICE_PREFIX}_${serial}`;
}

export function getDiscoveryTopic(serial: string): string {
  return `${getBaseTopic(serial)}/config`;
}

export function getStateTopic(serial: string): string {
  return `${getBaseTopic(serial)}/state`;
}

export function getCommandTopic(serial: string): string {
  return `${getBaseTopic(serial)}/set`;
}

// ============================================================================
// DISCOVERY PAYLOAD BUILDERS
// ============================================================================

/**
 * Build MQTT Discovery payload for a thermostat device
 * Adapts based on current mode (single-setpoint vs range)
 */
export function buildDiscoveryPayload(device: DeviceState): object {
  const { serial, name, manufacturer, model, state } = device;
  const isRangeMode = state.mode === "heat_cool";

  const config: DiscoveryPayload = {
    name: name,
    unique_id: serial,
    device: {
      identifiers: [serial],
      name: name,
      manufacturer: manufacturer,
      model: model,
    },
    // State topics
    state_topic: getStateTopic(serial),
    current_temperature_topic: getStateTopic(serial),
    mode_state_topic: getStateTopic(serial),
    action_topic: getStateTopic(serial),

    // Templates for parsing state
    current_temperature_template: "{{ value_json.current_temperature }}",
    mode_state_template: "{{ value_json.mode }}",
    action_template: "{{ value_json.action }}",

    // Settings
    precision: 0.5,
    temperature_unit: "C",
    modes: ["off", "heat", "cool", "heat_cool"],

    // Availability
    availability_topic: getStateTopic(serial),
    availability_template: "{{ 'online' if value_json.is_online else 'offline' }}",
  };

  // Configure temperature control based on mode
  const commandTopic = getCommandTopic(serial);

  if (isRangeMode) {
    // Range mode: use target_temp_low and target_temp_high
    config.temperature_low_state_topic = getStateTopic(serial);
    config.temperature_high_state_topic = getStateTopic(serial);
    config.temperature_low_command_topic = commandTopic;
    config.temperature_high_command_topic = commandTopic;
    config.temperature_low_command_template = '{"target_temperature_low": {{ value }} }';
    config.temperature_high_command_template = '{"target_temperature_high": {{ value }} }';
    config.temperature_low_state_template = "{{ value_json.target_temperature_low }}";
    config.temperature_high_state_template = "{{ value_json.target_temperature_high }}";
    config.mode_command_topic = commandTopic;
    config.mode_command_template = '{"mode": "{{ value }}"}';
  } else {
    // Single setpoint mode: use target_temperature
    config.temperature_state_topic = getStateTopic(serial);
    config.temperature_command_topic = commandTopic;
    config.temperature_command_template = '{"target_temperature": {{ value }} }';
    config.temperature_state_template = "{{ value_json.target_temperature }}";
    config.mode_command_topic = commandTopic;
    config.mode_command_template = '{"mode": "{{ value }}"}';
  }

  return config;
}

/**
 * Build state payload for publishing to MQTT
 * Adapts based on current mode (single-setpoint vs range)
 */
export function buildStatePayload(device: DeviceState): object {
  const { state } = device;
  const isRangeMode = state.mode === "heat_cool";

  const payload: StatePayload = {
    mode: state.mode,
    current_temperature: state.current_temperature,
    action: state.action,
    is_online: state.is_online,
  };

  // Include appropriate temperature fields based on mode
  if (isRangeMode) {
    payload.target_temperature_low = state.target_temperature_low;
    payload.target_temperature_high = state.target_temperature_high;
  } else {
    payload.target_temperature = state.target_temperature;
  }

  return payload;
}
