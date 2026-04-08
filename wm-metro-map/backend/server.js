import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { init as initGtfs, getMetroStops, getMetroRouteShape, isReady } from './gtfs-parser.js';
import { init as initRt, getTramPositions, stop as stopRt } from './gtfs-rt.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));

app.get('/api/stops', (req, res) => {
  try {
    if (!isReady()) return res.status(503).json({ error: 'GTFS data not yet loaded' });
    res.json(getMetroStops());
  } catch (err) {
    console.error('/api/stops error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/route-shape', (req, res) => {
  try {
    if (!isReady()) return res.status(503).json({ error: 'GTFS data not yet loaded' });
    res.json(getMetroRouteShape());
  } catch (err) {
    console.error('/api/route-shape error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/trams', (req, res) => {
  try {
    const data = getTramPositions();
    res.json({
      ...data,
      simulated: data.trams.length > 0 && !data.trams[0].isLive,
    });
  } catch (err) {
    console.error('/api/trams error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/config', (req, res) => {
  res.json({ maptilerKey: process.env.MAPTILER_KEY });
});

async function start() {
  console.log('[Server] Initializing GTFS static data...');
  await initGtfs();
  console.log('[Server] Starting GTFS-RT polling...');
  initRt();
  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => { stopRt(); process.exit(0); });
process.on('SIGINT', () => { stopRt(); process.exit(0); });

start().catch(err => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
