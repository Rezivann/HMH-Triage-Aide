const express = require('express');
const cors = require('cors');
const kioskRoutes = require('./routes/kioskRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const trackRoutes = require('./routes/trackRoutes');
const mobileCaptureRoutes = require('./routes/mobileCaptureRoutes');
const voiceRoutes = require('./routes/voiceRoutes');
const { corsOrigin } = require('./config/env');

const app = express();

// CORS_ORIGIN may be a comma-separated list (e.g. the stable production
// domain + http://localhost:5173 for local dev) - a single fixed string
// only ever allows one origin, which doesn't fit having both a real
// deployment and local dev working at the same time. Each entry must be a
// full origin (scheme + host, e.g. https://example.com) - a bare hostname
// is invalid per the CORS spec and browsers will reject it outright.
const allowedOrigins = corsOrigin.split(',').map((origin) => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header (curl, server-to-server calls, same-origin) - allow.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS: origin "${origin}" is not in CORS_ORIGIN`));
    },
  })
);
// Default 100kb is fine for every other route, but /kiosk/photo carries a
// base64-encoded camera photo (which itself runs ~33% larger than the raw
// JPEG) - a real kiosk/phone capture can be several MB before encoding.
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/kiosk', kioskRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/track', trackRoutes);
app.use('/mobile-capture', mobileCaptureRoutes);
app.use('/voice', voiceRoutes);

module.exports = app;
