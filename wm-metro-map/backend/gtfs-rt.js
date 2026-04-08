import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { getMetroRouteIds, getMetroTripIds, getMetroStops, getMetroStopTimes } from './gtfs-parser.js';

const { transit_realtime } = GtfsRealtimeBindings;

const VEHICLE_POSITIONS_URL = 'http://api.tfwm.org.uk/gtfs/vehicle_positions';
const TRIP_UPDATES_URL = 'http://api.tfwm.org.uk/gtfs/trip_updates';

let currentPositions = [];
let lastUpdated = null;
let pollInterval = null;
let consecutiveEmptyVP = 0;
let useFallback = false;
let currentPollDelay = 10000;

function buildUrl(base) {
  const appId = process.env.TFWM_APP_ID;
  const appKey = process.env.TFWM_APP_KEY;
  return `${base}?app_id=${appId}&app_key=${appKey}`;
}

async function fetchAndDecode(url) {
  const response = await fetch(url);
  if (response.status === 429) {
    console.warn('[GTFS-RT] Rate limited, backing off to 30s');
    currentPollDelay = 30000;
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  currentPollDelay = 10000;
  const buffer = await response.arrayBuffer();
  return transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
}

function filterMetroVehiclePositions(feed) {
  const routeIds = new Set(getMetroRouteIds());
  const tripIds = getMetroTripIds();
  const trams = [];

  for (const entity of feed.entity) {
    if (!entity.vehicle?.position) continue;

    const routeId = entity.vehicle.trip?.routeId;
    const tripId = entity.vehicle.trip?.tripId;

    if (!routeIds.has(routeId) && !tripIds.has(tripId)) continue;

    const lat = entity.vehicle.position.latitude;
    const lon = entity.vehicle.position.longitude;
    if (!lat || !lon) continue;

    const stopMap = new Map(getMetroStops().map(s => [s.stop_id, s.stop_name]));
    const nextStopName = stopMap.get(entity.vehicle.stopId) || null;

    trams.push({
      id: entity.vehicle.vehicle?.id || entity.vehicle.vehicle?.label || tripId || entity.id,
      lat,
      lon,
      nextStop: nextStopName,
      direction: entity.vehicle.trip?.directionId || 0,
      isLive: true,
    });
  }

  return trams;
}

function interpolateTripUpdates(feed) {
  const routeIds = new Set(getMetroRouteIds());
  const tripIds = getMetroTripIds();
  const stopTimesMap = getMetroStopTimes();
  const stopsArr = getMetroStops();
  const stopCoords = new Map(stopsArr.map(s => [s.stop_id, { lat: s.lat, lon: s.lon, name: s.stop_name }]));
  const now = Math.floor(Date.now() / 1000);
  const trams = [];

  for (const entity of feed.entity) {
    if (!entity.tripUpdate) continue;

    const routeId = entity.tripUpdate.trip?.routeId;
    const tripId = entity.tripUpdate.trip?.tripId;

    if (!routeIds.has(routeId) && !tripIds.has(tripId)) continue;

    const updates = entity.tripUpdate.stopTimeUpdate;
    if (!updates || updates.length < 2) continue;

    // Find the two stops the tram is currently between
    let fromStop = null;
    let toStop = null;

    for (let i = 0; i < updates.length - 1; i++) {
      const depTime = updates[i].departure?.time?.low ?? updates[i].departure?.time ?? null;
      const arrTime = updates[i + 1].arrival?.time?.low ?? updates[i + 1].arrival?.time ?? null;

      if (depTime !== null && arrTime !== null && depTime <= now && now <= arrTime) {
        fromStop = updates[i];
        toStop = updates[i + 1];
        break;
      }
    }

    if (!fromStop || !toStop) continue;

    const fromCoords = stopCoords.get(fromStop.stopId);
    const toCoords = stopCoords.get(toStop.stopId);
    if (!fromCoords || !toCoords) continue;

    const depTime = fromStop.departure?.time?.low ?? fromStop.departure?.time;
    const arrTime = toStop.arrival?.time?.low ?? toStop.arrival?.time;
    const fraction = Math.max(0, Math.min(1, (now - depTime) / (arrTime - depTime)));

    trams.push({
      id: entity.tripUpdate.vehicle?.id || tripId || entity.id,
      lat: fromCoords.lat + fraction * (toCoords.lat - fromCoords.lat),
      lon: fromCoords.lon + fraction * (toCoords.lon - fromCoords.lon),
      nextStop: toCoords.name,
      direction: entity.tripUpdate.trip?.directionId || 0,
      isLive: true,
    });
  }

  return trams;
}

async function poll() {
  try {
    if (!useFallback) {
      // Try VehiclePositions first
      const feed = await fetchAndDecode(buildUrl(VEHICLE_POSITIONS_URL));
      if (feed) {
        const trams = filterMetroVehiclePositions(feed);
        if (trams.length > 0) {
          currentPositions = trams;
          lastUpdated = new Date().toISOString();
          consecutiveEmptyVP = 0;
          console.log(`[GTFS-RT] VehiclePositions: ${trams.length} tram(s)`);
          return;
        }
        consecutiveEmptyVP++;
        if (consecutiveEmptyVP >= 3) {
          console.log('[GTFS-RT] VehiclePositions empty 3 times, switching to TripUpdates fallback');
          useFallback = true;
        }
      }
    }

    if (useFallback) {
      const feed = await fetchAndDecode(buildUrl(TRIP_UPDATES_URL));
      if (feed) {
        const trams = interpolateTripUpdates(feed);
        if (trams.length > 0) {
          currentPositions = trams;
          lastUpdated = new Date().toISOString();
          console.log(`[GTFS-RT] TripUpdates: ${trams.length} tram(s) (interpolated)`);
          return;
        }
      }
      // If TripUpdates also empty, try VehiclePositions again next cycle
      consecutiveEmptyVP = 0;
      useFallback = false;
    }

    // If we get here, no live data found — keep previous positions
    if (currentPositions.length === 0) {
      console.log('[GTFS-RT] No live tram data available');
    }
  } catch (err) {
    console.error('[GTFS-RT] Poll error:', err.message);
    // Keep previous positions on error
  }
}

export function init() {
  console.log('[GTFS-RT] Starting polling (every 10s)...');
  poll(); // immediate first poll
  pollInterval = setInterval(poll, currentPollDelay);
}

export function getTramPositions() {
  return {
    trams: currentPositions,
    lastUpdated,
  };
}

export function stop() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
