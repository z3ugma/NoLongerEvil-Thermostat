import express from 'express';
import path from 'path';
import fs from 'fs';
import { clearDevices, loadStubDevices, getDevices, deleteDevice } from './persistence';

const app = express();

// Security: Only allow connections from Home Assistant Ingress gateway
app.use((req, res, next) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    const ingressPath = req.headers['x-ingress-path'];
    
    console.log(`[ADMIN] Incoming request from ${clientIp} to ${req.path}`);
    if (ingressPath) {
        console.log(`[ADMIN] X-Ingress-Path: ${ingressPath}`);
    }
    
    // Allow localhost for development and 172.30.32.2 for Ingress
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1' || clientIp === '172.30.32.2' || clientIp === '::ffff:172.30.32.2') {
        next();
    } else {
        console.log(`[ADMIN] Rejected connection from ${clientIp}`);
        res.status(403).send('Access denied');
    }
});

app.use(express.json());

const PORT = 9543;

// API routes must come BEFORE static file serving
app.post('/clear', async (req, res) => {
    try {
        await clearDevices();
        console.log('[ADMIN] Device database cleared successfully.');
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error clearing database:', error);
        res.status(500).json({ error: 'Failed to clear database.' });
    }
});

app.post('/load-stubs', async (req, res) => {
    try {
        await loadStubDevices();
        console.log('[ADMIN] Stub devices loaded successfully.');
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error loading stub devices:', error);
        res.status(500).json({ error: 'Failed to load stub devices.' });
    }
});

app.get('/api/devices', (req, res) => {
    console.log('[ADMIN] GET /api/devices called');
    try {
        const devices = getDevices();
        console.log(`[ADMIN] Returning ${Object.keys(devices).length} devices`);
        console.log(`[ADMIN] Devices data:`, JSON.stringify(devices, null, 2));
        res.json(devices);
    } catch (error) {
        console.error('[ADMIN] Error getting devices:', error);
        res.status(500).json({ error: 'Failed to get devices.' });
    }
});

app.delete('/api/devices/:serial', async (req, res) => {
    try {
        const { serial } = req.params;
        await deleteDevice(serial);
        console.log(`[ADMIN] Device ${serial} deleted successfully.`);
        res.json({ success: true });
    } catch (error) {
        console.error('[ADMIN] Error deleting device:', error);
        res.status(500).json({ error: 'Failed to delete device.' });
    }
});

// Serve index.html with injected base URL from X-Ingress-Path header
app.get('/', (req, res) => {
    const ingressPath = req.headers['x-ingress-path'] as string || '';
    const baseUrl = ingressPath || '';
    
    console.log(`[ADMIN] Serving index.html with BASE_URL: "${baseUrl}"`);
    
    const htmlPath = path.join(__dirname, 'admin-public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    
    // Inject the BASE_URL into the HTML
    const injectedHtml = html.replace(
        '{{BASE_URL}}',
        baseUrl
    );
    
    res.setHeader('Content-Type', 'text/html');
    res.send(injectedHtml);
});

// Serve static files from admin-public directory (AFTER all routes including /)
const staticPath = path.join(__dirname, 'admin-public');
console.log(`[ADMIN] Serving static files from: ${staticPath}`);
app.use(express.static(staticPath));

export function startAdminServer() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[ADMIN] Admin server running on port ${PORT}`);
        console.log(`[ADMIN] Ingress-ready: Accepting connections from 172.30.32.2`);
    });
}
