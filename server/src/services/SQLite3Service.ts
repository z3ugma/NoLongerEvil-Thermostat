/**
 * SQLite3Service.ts
 * Centralized wrapper for all SQLite3 database operations
 * Provides type-safe methods and error handling for Convex interactions
 */
import { Database } from 'sqlite3';
import type {
  DeviceObject,
  DeviceOwner,
  StateEntryKey,
  StateWeatherCache,
  WeatherData,
  DeviceStateStore,
} from '../lib/types';
import { environment } from '../config/environment';
import { AbstractDeviceStateManager } from './AbstractDeviceStateManager';

interface DeviceRow {
  serial: string;
  object_key: string;
  object_revision: number;
  object_timestamp: number;
  value: string; // The value is stored as a JSON string in the DB
}


export class SQLite3Service extends AbstractDeviceStateManager {
  private db: Database | null = null;
  private initPromise: Promise<Database | null> | null = null;

  private async createSchema(db: Database): Promise<void> {
    console.log('[SQLite3] Creating database schema...');
    
    const schemaStatements = [
      `CREATE TABLE IF NOT EXISTS device (
        serial TEXT NOT NULL,
        object_key TEXT NOT NULL,
        object_revision INTEGER NOT NULL,
        object_timestamp INTEGER NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (serial, object_key)
      );`,
    ];

    for (const stmt of schemaStatements) {
      await new Promise<void>((resolve, reject) => {
        db.run(stmt, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }

    console.log('[SQLite3] Database schema created or already exists.');
  }

  /**
   * Initialize SQLite3 database connection
   */
  private async getDb(): Promise<Database | null> {
    if (this.db) {
      return this.db;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        const SQLITE3_DB_PATH = environment.SQLITE3_DB_PATH!;
        console.debug('Initializing SQLite3 db at ', SQLITE3_DB_PATH);
        
        const db = await new Promise<Database>((resolve, reject) => {
          const db = new Database(SQLITE3_DB_PATH, (err) => {
            if (err) {
                reject(err);
            }
          });
          resolve(db);
        });

        await this.createSchema(db);

        this.db = db;
        console.log('[SQLite3] Db initialized successfully');
        return db;
      } catch (error) {
        console.error('[SQLite3] Failed to initialize database:', error);
        return null;
      }
    })();

    return this.initPromise;
  }

  /**
   * Upsert device state object
   */
  async upsertState(
    serial: string,
    objectKey: string,
    revision: number,
    timestamp: number,
    value: Record<string, any>
  ): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      console.warn('[SQLite3] Cannot upsert state: client not available');
      return;
    }

    try {
      db.run(`INSERT INTO device (serial, object_key, object_revision, object_timestamp, value)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(serial, object_key) DO UPDATE SET
                object_revision = excluded.object_revision,
                object_timestamp = excluded.object_timestamp,
                value = excluded.value;`,
        [serial, objectKey, revision, timestamp, JSON.stringify(value)],
        (err) => {
          if (err) {
            throw err;
          }
        }
      );
    } catch (error) {
      console.error(`[SQLite3] Failed to upsert state for ${serial}/${objectKey}:`, error);
      throw error;
    }
  }

  /**
   * Get single device state object
   */
  async getState(serial: string, objectKey: string): Promise<DeviceObject | null> {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        db.get(
          `SELECT serial, object_key, object_revision, object_timestamp, value
           FROM device
           WHERE serial = ? AND object_key = ?;`,
          [serial, objectKey],
          (err, row: DeviceRow) => {
            if (err) {
              console.error(`[SQLite3] Failed to get state for ${serial}/${objectKey}:`, err);
              return reject(err);
            }
            if (row) {
              resolve({
                object_key: row.object_key,
                object_revision: row.object_revision,
                object_timestamp: row.object_timestamp,
                value: JSON.parse(row.value),
              });
            } else {
              resolve(null);
            }
          }
        );
      } catch (error) {
        console.error(`[SQLite3] Exception during getState for ${serial}/${objectKey}:`, error);
        reject(error);
      }
    });
  }

  /**
   * Get all state for a device
   */
  async getAllState(): Promise<DeviceStateStore> {
    const db = await this.getDb();
    if (!db) {
      return {};
    }

    return new Promise((resolve, reject) => {
      db.all(`SELECT serial, object_key, object_revision, object_timestamp, value FROM device`, [], (err, rows: DeviceRow[]) => {
        if (err) {
          console.error('[SQLite3] Failed to get all state:', err);
          return reject(err);
        }

        try {
          const deviceStateStore = rows.reduce<DeviceStateStore>((acc, row) => {
            if (!acc[row.serial]) {
              acc[row.serial] = {};
            }
            acc[row.serial][row.object_key] = {
              object_key: row.object_key,
              object_revision: row.object_revision,
              object_timestamp: row.object_timestamp,
              value: JSON.parse(row.value),
            };
            return acc;
          }, {});

          resolve(deviceStateStore);
        } catch (parseError) {
          console.error('[SQLite3] Failed to parse database rows into state store:', parseError);
          reject(parseError);
        }
      });
    });
  }

  /**
   * Generate entry key for device pairing
   */
  async generateEntryKey(serial: string, ttlSeconds: number): Promise<StateEntryKey | null> {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    try {
      const result = await db.mutation('users:generateEntryKey' as any, {
        serial,
        ttlSeconds,
      });
      return result;
    } catch (error) {
      console.error(`[SQLite3] Failed to generate entry key for ${serial}:`, error);
      return null;
    }
  }

  /**
   * Get device owner
   */
  async getDeviceOwner(serial: string): Promise<DeviceOwner | null> {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    try {
      const result = await db.query('users:getDeviceOwner' as any, { serial });
      return result;
    } catch (error) {
      console.error(`[SQLite3] Failed to get device owner for ${serial}:`, error);
      return null;
    }
  }

  /**
   * Update user away status based on device state
   */
  async updateUserAwayStatus(userId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return;
    }

    try {
      await db.mutation('users:updateUserAwayStatus' as any, { userId });
    } catch (error) {
      console.error(`[SQLite3] Failed to update away status for user ${userId}:`, error);
    }
  }

  /**
   * Sync user weather from device postal code
   */
  async syncUserWeatherFromDevice(userId: string): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return;
    }

    try {
      await db.mutation('users:syncUserWeatherFromDevice' as any, { userId });
    } catch (error) {
      console.error(`[SQLite3] Failed to sync weather for user ${userId}:`, error);
    }
  }

  /**
   * Ensure device alert dialog exists
   * TODO: Implement this for SQLite if needed. For now, it's a no-op.
   */
  async ensureDeviceAlertDialog(serial: string): Promise<void> {
    // This was a Convex-specific function. We can implement the equivalent
    // logic here if we discover it's necessary for the Nest protocol.
    console.log(`[SQLite3] STUB: ensureDeviceAlertDialog for ${serial}`);
    return Promise.resolve();
  }

  /**
   * Get cached weather data
   */
  async getWeather(postalCode: string, country: string): Promise<StateWeatherCache | null> {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    try {
      const result = await db.query('weather:getWeather' as any, { postalCode, country });
      return result;
    } catch (error) {
      console.error(`[SQLite3] Failed to get weather for ${postalCode}, ${country}:`, error);
      return null;
    }
  }

  /**
   * Upsert weather cache
   */
  async upsertWeather(
    postalCode: string,
    country: string,
    fetchedAt: number,
    data: WeatherData
  ): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return;
    }

    try {
      await db.mutation('weather:upsertWeather' as any, {
        postalCode,
        country,
        fetchedAt,
        data,
      });
    } catch (error) {
      console.error(`[SQLite3] Failed to upsert weather for ${postalCode}, ${country}:`, error);
    }
  }

  /**
   * Update weather for all users with postal code
   */
  async updateWeatherForPostalCode(
    postalCode: string,
    country: string,
    weatherData: WeatherData
  ): Promise<void> {
    const db = await this.getDb();
    if (!db) {
      return;
    }

    try {
      await db.mutation('users:updateWeatherForPostalCode' as any, {
        postalCode,
        country,
        weatherData,
      });
    } catch (error) {
      console.error(
        `[SQLite3] Failed to update weather for postal code ${postalCode}, ${country}:`,
        error
      );
    }
  }

  /**
   * Get user's weather data
   */
  async getUserWeather(userId: string): Promise<any | null> {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    try {
      const result = await db.query('users:getUserById' as any, { userId });
      return result?.weather || null;
    } catch (error) {
      console.error(`[SQLite3] Failed to get user weather for ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get all enabled MQTT integrations for loading by IntegrationManager
   * Uses secure action to decrypt passwords
   */
  async getAllEnabledMqttIntegrations(): Promise<Array<{ userId: string; config: any }>> {
    const db = await this.getDb();
    if (!db) {
      return [];
    }

    try {
      const integrations = await db.action('integrations_actions:getAllEnabledMqttIntegrationsSecure' as any, {});
      return integrations || [];
    } catch (error) {
      console.error('[SQLite3] Failed to fetch enabled MQTT integrations:', error);
      return [];
    }
  }

  /**
   * Validate API key for authentication
   */
  async validateApiKey(key: string): Promise<{ userId: string; permissions: any; keyId: string } | null> {
    const db = await this.getDb();
    if (!db) {
      return null;
    }

    try {
      const result = await db.mutation('apiKeys:validateApiKey' as any, { key });
      return result;
    } catch (error) {
      console.error('[SQLite3] Failed to validate API key:', error);
      return null;
    }
  }

  /**
   * Check if API key has permission to access a device
   */
  async checkApiKeyPermission(
    userId: string,
    serial: string,
    requiredScopes: string[],
    permissions: { serials: string[]; scopes: string[] }
  ): Promise<boolean> {
    const db = await this.getDb();
    if (!db) {
      return false;
    }

    try {
      const result = await db.query('apiKeys:checkApiKeyPermission' as any, {
        userId,
        serial,
        requiredScopes,
        permissions,
      });
      return result || false;
    } catch (error) {
      console.error('[SQLite3] Failed to check API key permission:', error);
      return false;
    }
  }

  /**
   * List all devices owned by a user
   */
  async listUserDevices(userId: string): Promise<Array<{ serial: string }>> {
    const db = await this.getDb();
    if (!db) {
      return [];
    }

    try {
      const devices = await db.query('users:listUserDevices' as any, { userId });
      return devices || [];
    } catch (error) {
      console.error('[SQLite3] Failed to list user devices:', error);
      return [];
    }
  }

  /**
   * Get devices shared with a user
   */
  async getSharedWithMe(userId: string): Promise<Array<{ serial: string; permissions: string[] }>> {
    const db = await this.getDb();
    if (!db) {
      return [];
    }

    try {
      const shares = await db.query('shares:getSharedWithMe' as any, { userId });
      return shares || [];
    } catch (error) {
      console.error('[SQLite3] Failed to get shared devices:', error);
      return [];
    }
  }
}
