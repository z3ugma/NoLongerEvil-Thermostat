import { EventEmitter } from 'events';

/**
 * A singleton event manager for application-wide communication.
 * This allows different modules to subscribe and publish events without
 * being directly coupled to each other.
 */
const eventManager = new EventEmitter();

export default eventManager;
