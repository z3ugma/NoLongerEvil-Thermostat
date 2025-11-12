import { MQTTClient } from "./mqtt-client";
import { initialize as initializePersistence } from "./persistence";
import { startAdminServer } from './admin-server';

async function initialize() {
  console.log("===========================================");
  console.log("        NoLongerEvil API Server");
  console.log("===========================================");

  try {
    console.log("[INIT] Initializing persistence layer...");
    await initializePersistence();
    console.log("[INIT] ✓ Persistence layer ready.");

    // Start the admin UI server
    startAdminServer();

    console.log("[INIT] Initializing MQTT client...");
    const mqttClient = new MQTTClient();
    await mqttClient.initialize();
    console.log("\n[INIT] ✓ System is fully initialized and running.\n");

  } catch (error) {
    console.error("[INIT] 💥 A critical error occurred during startup:", error);
    process.exit(1);
  }
}

initialize();