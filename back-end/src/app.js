const express = require('express');
const cors = require('cors');
const kioskRoutes = require('./routes/kioskRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const trackRoutes = require('./routes/trackRoutes');
const mobileCaptureRoutes = require('./routes/mobileCaptureRoutes');
const { corsOrigin } = require('./config/env');

const app = express();

app.use(cors({ origin: corsOrigin }));
// Default 100kb is fine for every other route, but /kiosk/photo carries a
// base64-encoded camera photo (which itself runs ~33% larger than the raw
// JPEG) - a real kiosk/phone capture can be several MB before encoding.
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/kiosk', kioskRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/track', trackRoutes);
app.use('/mobile-capture', mobileCaptureRoutes);

module.exports = app;
