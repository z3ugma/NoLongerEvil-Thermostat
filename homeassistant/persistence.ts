import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';



// Define the structure of our data file
export interface DeviceState {
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

export const STUB_THERMOSTATS: Record<string, DeviceState> = {
    "02AA01AC171401XF": {
        serial: "02AA01AC171401XF",
        name: "Living Room Thermostat",
        manufacturer: "Google Nest",
        model: "Learning Thermostat",
        state: {
            mode: "heat",
            current_temperature: 20,
            target_temperature: 22,
            action: "idle",
            is_online: true,
        },
    },
    "02AA01AC171402YG": {
        serial: "02AA01AC171402YG",
        name: "Bedroom Thermostat",
        manufacturer: "Google Nest",
        model: "Thermostat E",
        state: {
            mode: "cool",
            current_temperature: 23,
            target_temperature: 21,
            action: "idle",
            is_online: true,
        },
    }
};

interface DatabaseSchema {
    devices: Record<string, DeviceState>;
}

const defaultData: DatabaseSchema = { devices: {} };

// Home Assistant add-ons store persistent data in /data
const DB_PATH = path.join(process.env.DATA_PATH || '/data', 'db.json');

let db: Low<DatabaseSchema>;

/**
 * Initializes the LowDB database connection.
 * Reads from the JSON file, creating it with a default structure if it doesn't exist.
 */
export async function initialize() {
    const adapter = new JSONFile<DatabaseSchema>(DB_PATH);
    db = new Low<DatabaseSchema>(adapter, defaultData);

    await db.read();
    console.log('[PERSISTENCE] Database loaded from', DB_PATH);
}

/**
 * Retrieves the entire devices object from the database.
 * @returns {Record<string, DeviceState>} The collection of device states.
 */
export function getDevices(): Record<string, DeviceState> {
    return db.data.devices;
}

import eventManager from './event-manager';

// ... (existing code) ...

/**
 * Updates the state for a specific device and writes it to the database file.
 * After a successful write, it emits a 'device:updated' event with the old and new state.
 * @param {string} serial - The device serial number.
 * @param {DeviceState} device - The complete new state for the device.
 */
export async function updateDevice(serial: string, device: DeviceState) {
    if (!db) {
        throw new Error('[PERSISTENCE] Error: Database not initialized. Call initialize() first.');
    }
    const oldState = db.data.devices[serial] ? JSON.parse(JSON.stringify(db.data.devices[serial])) : undefined;
    db.data.devices[serial] = device;
    await db.write();

    console.log(`[PERSISTENCE] Wrote update for device ${serial} to database.`);
    eventManager.emit('device:updated', { oldState, newState: device });
}

/**
 * Deletes a device from the database.
 * After a successful delete, it emits a 'device:deleted' event.
 * @param {string} serial - The device serial number to delete.
 */
export async function deleteDevice(serial: string) {
    if (!db) {
        throw new Error('[PERSISTENCE] Error: Database not initialized. Call initialize() first.');
    }
    const oldState = db.data.devices[serial];
    if (oldState) {
        delete db.data.devices[serial];
        await db.write();
        console.log(`[PERSISTENCE] Deleted device ${serial} from database.`);
        eventManager.emit('device:deleted', { serial });
    }
}

/**
 * Clears all devices from the database.
 */
export async function clearDevices() {
    if (!db) {
        throw new Error('[PERSISTENCE] Error: Database not initialized. Call initialize() first.');
    }
    const serials = Object.keys(db.data.devices);
    for (const serial of serials) {
        await deleteDevice(serial); // This will emit 'device:deleted' for each device
    }
    console.log('[PERSISTENCE] All devices have been cleared from the database.');
}

/**
 * Loads the predefined stub thermostats into the database.
 */
export async function loadStubDevices() {
    if (!db) {
        throw new Error('[PERSISTENCE] Error: Database not initialized. Call initialize() first.');
    }
    console.log('[PERSISTENCE] Loading stub devices into the database...');
    for (const serial in STUB_THERMOSTATS) {
        await updateDevice(serial, STUB_THERMOSTATS[serial]); // This will emit 'device:updated' for each device
    }
    console.log(`[PERSISTENCE] Successfully loaded ${Object.keys(STUB_THERMOSTATS).length} stub devices.`);
}







