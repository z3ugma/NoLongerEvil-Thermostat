#!/usr/bin/with-contenv bashio

bashio::log.info "Starting NoLongerEvil API Server..."

# Debug: Check if Mosquitto service is available
bashio::log.info "Checking for MQTT service..."
if bashio::services "mqtt" "host" > /dev/null 2>&1; then
    bashio::log.info "MQTT service IS available from Supervisor"
    
    # Extract MQTT credentials from Supervisor services API
    export MQTT_HOST=$(bashio::services "mqtt" "host")
    export MQTT_PORT=$(bashio::services "mqtt" "port")
    export MQTT_USER=$(bashio::services "mqtt" "username")
    export MQTT_PASSWORD=$(bashio::services "mqtt" "password")
    
    bashio::log.info "MQTT service configured:"
    bashio::log.info "  Host: ${MQTT_HOST}"
    bashio::log.info "  Port: ${MQTT_PORT}"
    bashio::log.info "  User: ${MQTT_USER}"
else
    bashio::log.warning "MQTT service is NOT available from Supervisor"
    bashio::log.warning "This usually means:"
    bashio::log.warning "  1. Mosquitto broker add-on is not installed or not started"
    bashio::log.warning "  2. Mosquitto broker is not providing the 'mqtt' service"
    bashio::log.warning "Climate entities will be state-only via WebSocket"
fi

# Change to the application directory where the code lives
cd /app || exit

# Now, npm can find package.json and run the application
npm start