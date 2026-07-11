const express = require('express');
const cors = require('cors');
const kioskRoutes = require('./routes/kioskRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const trackRoutes = require('./routes/trackRoutes');
const { corsOrigin } = require('./config/env');

const app = express();

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/kiosk', kioskRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/track', trackRoutes);

module.exports = app;
