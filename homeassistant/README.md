# NoLongerEvil - Home Assistant Nest Thermostat Integration

## Overview

NoLongerEvil is a self-hosted Home Assistant add-on that provides MQTT-based climate entity integration. It uses an event-driven architecture to manage thermostat device states with persistent storage and a web-based admin UI accessible through Home Assistant Ingress.

## Current Architecture

### Technology Stack

- **Language:** TypeScript
- **Runtime:** Node.js with ts-node
- **Database:** LowDB (JSON file-based persistence in `/data/db.json`)
- **Communication:** MQTT (via Home Assistant Mosquitto broker)
- **Admin UI:** Express.js server with HTML/JavaScript frontend
- **Integration:** Home Assistant Ingress for web UI access

### Core Components

#### 1. **Entry Point (`index.ts`)**

- Minimal initialization and orchestration
- Starts persistence layer
- Starts admin web server (port 9543)
- Initializes MQTT client

#### 2. **Persistence Layer (`persistence.ts`)**

- LowDB-based JSON storage
- Device state management (CRUD operations)
- Emits events on state changes (`device:updated`, `device:deleted`)
- Includes 2 stub thermostats for testing:
  - `02AA01AC171401XF` - Living Room Thermostat (heat mode)
  - `02AA01AC171402YG` - Bedroom Thermostat (cool mode)

#### 3. **Event Manager (`event-manager.ts`)**

- Central event bus for decoupled communication
- Enables reactive updates across modules

#### 4. **MQTT Client (`mqtt-client.ts`)**

- Stateless MQTT bridge
- Listens to `device:updated` and `device:deleted` events from persistence
- Publishes MQTT Discovery messages to Home Assistant
- Publishes device state updates
- Subscribes to command topics from Home Assistant
- Handles round-trip state confirmation (required by HA)
- Intelligently republishes discovery only when mode changes (for proper UI rendering)

#### 5. **MQTT Discovery Config (`mqtt-discovery-config.ts`)**

- Pure functions for topic generation
- Payload builders for discovery and state messages
- Mode-aware configuration (handles `heat`, `cool`, `heat_cool`, `off`)
- Properly switches between single-setpoint and dual-setpoint modes

#### 6. **Admin Server (`admin-server.ts`)**

- Express.js web server on port 9543
- Ingress-ready (accepts connections from `172.30.32.2`)
- REST API for device management
- Serves static HTML UI with injected Ingress path

#### 7. **Admin UI (`admin-public/index.html`)**

- Device management interface
- Shows all devices with old/new state comparison
- Real-time auto-refresh (every 2 seconds when window has focus)
- Operations:
  - Clear all devices
  - Load stub devices (for testing)
  - Delete individual devices
- Uses relative URLs for Ingress compatibility

### Data Flow

#### Startup Sequence

```
index.ts
  ↓
1. Initialize persistence (load /data/db.json)
  ↓
2. Start admin server (port 9543)
  ↓
3. Initialize MQTT client
   - Connect to broker
   - Load existing devices from database
   - Publish discovery + state for each device
   - Subscribe to command topics
```

#### Command Flow (Home Assistant → Device State)

```
User changes thermostat in HA UI
  ↓
HA publishes to MQTT command topic
  ↓
MQTTClient.handleCommand() receives command
  ↓
persistence.updateDevice() saves to /data/db.json
  ↓
persistence emits 'device:updated' event
  ↓
MQTTClient listens and reacts:
  - If mode changed: republish discovery (updates HA UI controls)
  - Always: publish state back to MQTT
  ↓
Home Assistant receives state confirmation
  ↓
HA UI updates to reflect new state
```

#### Admin UI Flow (User → Device State)

```
User clicks "Load Stub Devices" in admin UI
  ↓
POST /load-stubs → admin-server.ts
  ↓
persistence.loadStubDevices() writes to db.json
  ↓
For each device:
  persistence.updateDevice() emits 'device:updated'
  ↓
  MQTTClient publishes discovery + state
  ↓
  Device appears in Home Assistant
```

## Configuration

### Home Assistant Add-on Config (`config.yaml`)

- **Ingress:** Enabled on port 9543
- **Services Required:** `mqtt:need` (Mosquitto broker)
- **API Access:** `hassio_api: true`, `hassio_role: default`
- **Architecture Support:** aarch64, amd64, armhf, armv7, i386

### Environment Variables (Auto-injected by HA Supervisor)

- `MQTT_HOST` - Mosquitto broker hostname
- `MQTT_PORT` - Broker port (default: 1883)
- `MQTT_USER` - MQTT username
- `MQTT_PASSWORD` - MQTT password
- `SUPERVISOR_TOKEN` - HA API access token

### Development Environment

- **DevContainer:** Configured in `.devcontainer/devcontainer.json`
- **Docker Compose:** Runs in Docker-in-Docker setup
- **Port Mapping:** 9543 for admin UI

## API Endpoints

### Admin REST API (Port 9543)

- `GET /` - Admin UI (HTML interface)
- `GET /api/devices` - List all devices in database
- `POST /clear` - Clear all devices from database
- `POST /load-stubs` - Load 2 stub thermostats for testing
- `DELETE /api/devices/:serial` - Delete specific device by serial

## MQTT Topics

### Topic Structure

```
homeassistant/climate/nolongerevil_{SERIAL}/config      # Discovery
homeassistant/climate/nolongerevil_{SERIAL}/state       # State updates
homeassistant/climate/nolongerevil_{SERIAL}/set         # Command topic
```

### Discovery Behavior

- Published on device initialization
- **Republished when mode changes** (e.g., `heat` → `heat_cool`)
  - Necessary because dual-setpoint mode requires different HA UI controls
  - Switches from `target_temperature` to `target_temperature_low/high`

### State Publishing

- Published after every state change
- Includes: mode, current_temperature, target temps, action, online status
- **Round-trip pattern:** HA commands are immediately confirmed by publishing updated state back

## Testing

### Quick Start in Home Assistant

1. Install Mosquitto broker add-on (if not already installed)
2. Install NoLongerEvil add-on
3. Access admin UI via Ingress (Add-on UI tab)
4. Click "Load Stub Devices"
5. Go to Settings → Devices & Services → MQTT
6. See auto-discovered thermostats
7. Control them from HA Lovelace UI

### Admin UI Features

- **Auto-refresh:** Updates every 2 seconds when tab is focused
- **Device Cards:** Show device serial, name, and current state
- **State Comparison:** See old state vs new state for debugging
- **Real-time Updates:** No manual refresh needed

### Development Workflow

1. Make code changes
2. Run `npm run check` to verify TypeScript and lint
3. Rebuild Docker container
4. Test in Home Assistant environment

## Dependencies (package.json)

### Runtime Dependencies

- `mqtt` - MQTT client library
- `lowdb` - JSON file database
- `express` - Admin web server
- `typescript` - Type checking
- `ts-node` - TypeScript execution
- `lodash` - Utility functions
- `ws` - WebSocket support
- `dotenv` - Environment variable management

### Development Dependencies

- `@typescript-eslint/*` - TypeScript linting
- `@types/*` - Type definitions
- `eslint` - Code linting

## File Structure

```
/homeassistant_addon
├── index.ts                      # Entry point & initialization
├── persistence.ts                # LowDB storage & event emission
├── mqtt-client.ts                # MQTT operations & HA integration
├── mqtt-discovery-config.ts      # Topic builders & payload generators
├── admin-server.ts               # Express web server
├── event-manager.ts              # Central event bus
├── admin-public/
│   └── index.html                # Admin UI interface
├── config.yaml                   # HA add-on configuration
├── Dockerfile                    # Container build instructions
├── run.sh                        # Container startup script
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Node.js dependencies
└── .devcontainer/
    └── devcontainer.json         # VS Code devcontainer config
└── .vscode/
    └── tasks.json                # Home Assistant Add On Tasks
```

## Key Design Principles

### 1. **Event-Driven Architecture**

- Components communicate via events, not direct calls
- Enables loose coupling and easy extensibility
- Persistence layer is the source of truth

### 2. **Stateless MQTT Client**

- No internal device state cache
- Reacts to persistence events only
- Idempotent subscription management

### 3. **Single Responsibility**

- Each module has one clear purpose
- Easy to test and maintain
- Clear separation of concerns

### 4. **Ingress-First Design**

- Admin UI works seamlessly through HA Ingress
- Base URL injection for proper routing
- Security through IP filtering

### 5. **Round-Trip State Confirmation**

- Required by Home Assistant for reliable UI updates
- Commands are persisted, then echoed back via MQTT
- Ensures HA always shows current state

---

## TODO: Missing Features & Integration Points

### 🔴 Critical - Nest Device API Integration

The core functionality to communicate with actual Nest thermostats is currently missing. Based on the project history, this needs to be reimplemented:

#### Missing Modules

- **`nest.ts`** - Nest protocol handler (previously existed, now deleted)
  - Entry endpoint (`POST /nest/entry`)
  - Passphrase endpoint (`POST /nest/passphrase`)
  - Transport/long-poll endpoint (`POST /nest/transport`)
  - Put endpoint (`POST /nest/put`) for device updates
  - Weather API proxy (`GET /nest/weather/v1`)
  - Device authentication using Basic auth with serial numbers
  - Long-polling connection management for real-time updates

#### Required Implementation

1. **HTTP Server for Nest Device Protocol** (was on port 80)

   - Separate from admin server (port 9543)
   - Handle proprietary Nest HTTP long-polling
   - Receive state updates FROM physical thermostats
   - Send state updates TO physical thermostats
   - Connection status tracking per device

2. **Bidirectional Data Flow**

   ```
   Physical Nest Device
     ↕ (Nest HTTP Protocol)
   Nest API Module
     ↕ (Events)
   Persistence Layer
     ↕ (Events)
   MQTT Client
     ↕ (MQTT)
   Home Assistant
   ```

3. **Integration Points**
   - Listen for `device:updated` events from persistence
   - Push updates to connected Nest devices via long-poll
   - Receive updates from devices, call `persistence.updateDevice()`
   - Emit state when device connects/disconnects
   - Handle device authentication and session management

#### Environment Variables Needed

- `API_ORIGIN` - Base URL for Nest device callbacks (e.g., `http://172.30.33.0:9543`)

### 🟡 Important - Additional Features

#### Web UI Enhancements

- **Read-only Status Dashboard** (currently admin-only)
  - Show live thermostat states
  - Display connection status per device
  - Real-time updates via WebSocket or SSE
  - No control functionality (controls stay in HA)

#### Device Discovery & Management

- **Automatic Device Detection**

  - Detect when new Nest devices connect
  - Auto-add to database on first connection
  - Auto-publish MQTT discovery for new devices

- **Device Metadata Storage**
  - Store device model, firmware version
  - Track last seen timestamp
  - Connection history

#### State Management Improvements

- **TTL-Based Online Status**

  - Mark devices offline if not seen for 90 seconds
  - Periodic check via timer (mentioned in history)
  - Publish offline status to MQTT

- **State Reconciliation**
  - Compare expected state (database) vs actual state (device)
  - Handle conflicts with last-write-wins + timestamps
  - Recovery from desync scenarios

#### Weather Integration

- **Weather API Proxy** (was implemented before)
  - Proxy `weather.nest.com` calls from devices
  - Cache weather data to reduce API calls
  - Handle SSL certificate issues (`rejectUnauthorized: false` fix)

### 🟢 Nice-to-Have

#### Observability

- **Swagger/OpenAPI Documentation** (partially implemented before)

  - Document all REST API endpoints
  - Interactive API testing interface
  - JSDoc comments on functions

- **Enhanced Logging**
  - Log levels (debug, info, warn, error)
  - Request/response logging for Nest protocol
  - MQTT message tracing

#### Testing

- **Simulator/Mock Device** (Postman collection existed)
  - Mock Nest device for testing without hardware
  - Simulated long-polling client
  - State change simulator

#### Monitoring

- **Health Check Endpoints**
  - `/health` - Overall system status
  - `/metrics` - Prometheus-style metrics
  - MQTT connection status
  - Database health

#### Advanced Features

- **Multi-User Support** (was removed from Convex)

  - User authentication
  - Per-user device access
  - Entry key claiming

- **Historical Data**
  - State change history
  - Temperature trends
  - Mode usage statistics

### 📋 Known Technical Debt

1. **SSL/TLS Removed**

   - All HTTPS server code was stripped out
   - Now HTTP-only (port 80 → 9543)
   - Fine for local network, but limits remote access options

2. **No WebSocket in Current Build**

   - Admin UI polls every 2 seconds
   - WebSocket implementation existed before (`websocket.js`)
   - Would enable true real-time updates

3. **No Nest State Manager**

   - Original architecture had a `StateManager` class
   - Would provide centralized state with conflict resolution
   - Currently persistence layer is the only state holder

4. **Hardcoded Values**
   - Device manufacturer always "Google Nest"
   - Model names hardcoded in stubs
   - Should be populated from actual device info

### 🔧 Migration Notes

If reimplementing the Nest API module:

- Use event-driven pattern: emit events, don't call directly
- Integration example: `nest.ts` emits → persistence saves → MQTT publishes
- See git history for previous implementation (`nest.js` before TypeScript migration)

---
