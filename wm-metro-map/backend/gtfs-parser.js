import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { METRO_STOP_NAMES } from './known-stops.js';

const GTFS_URL = 'http://api.tfwm.org.uk/gtfs/tfwm_gtfs.zip';

let metroStops = [];
let metroRouteShape = { paths: [] };
let metroRouteIds = [];
let metroTripIds = new Set();
let metroStopTimes = new Map();
let ready = false;

function stripBom(str) {
  return str.replace(/^\uFEFF/, '');
}

function parseCsv(buffer) {
  return parse(stripBom(buffer.toString()), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });
}

function parseTimeToSeconds(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length !== 3) return null;
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
}

async function fetchGtfsZip() {
  const appId = process.env.TFWM_APP_ID;
  const appKey = process.env.TFWM_APP_KEY;
  const url = `${GTFS_URL}?app_id=${appId}&app_key=${appKey}`;

  console.log('[GTFS] Downloading static GTFS feed...');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GTFS download failed: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  console.log(`[GTFS] Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
  return Buffer.from(arrayBuffer);
}

function findMetroRouteIds(routes) {
  // Tier 1: look for route_type === '0' (Tram/Light Rail) or name match
  const found = routes.filter(r => {
    const type = String(r.route_type).trim();
    const longName = (r.route_long_name || '').toLowerCase();
    const shortName = (r.route_short_name || '').toLowerCase();
    return type === '0' ||
      longName.includes('metro') || longName.includes('tram') ||
      shortName.includes('metro') || shortName.includes('tram');
  });
  return found.map(r => r.route_id);
}

function findMetroRouteIdsByStops(stops, stopTimes, trips) {
  // Tier 2 fallback: match known stop names → stop_ids → trip_ids → route_ids
  const knownNamesLower = new Set(METRO_STOP_NAMES.map(n => n.toLowerCase()));
  const metroStopIds = new Set(
    stops
      .filter(s => knownNamesLower.has((s.stop_name || '').toLowerCase().trim()))
      .map(s => s.stop_id)
  );

  if (metroStopIds.size === 0) {
    console.warn('[GTFS] No matching Metro stops found in stops.txt');
    return [];
  }

  const metroTripIdSet = new Set(
    stopTimes
      .filter(st => metroStopIds.has(st.stop_id))
      .map(st => st.trip_id)
  );

  const tripToRoute = new Map(trips.map(t => [t.trip_id, t.route_id]));
  const routeIds = new Set();
  for (const tripId of metroTripIdSet) {
    const routeId = tripToRoute.get(tripId);
    if (routeId) routeIds.add(routeId);
  }

  return [...routeIds];
}

export async function init() {
  let zipBuffer;
  try {
    zipBuffer = await fetchGtfsZip();
  } catch (err) {
    console.error('[GTFS] First download attempt failed:', err.message);
    console.log('[GTFS] Retrying in 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
    try {
      zipBuffer = await fetchGtfsZip();
    } catch (err2) {
      console.error('[GTFS] Second download attempt failed:', err2.message);
      console.warn('[GTFS] Starting with empty data');
      ready = true;
      return;
    }
  }

  console.log('[GTFS] Parsing ZIP...');
  const zip = new AdmZip(zipBuffer);

  const routesEntry = zip.getEntry('routes.txt');
  const stopsEntry = zip.getEntry('stops.txt');
  const tripsEntry = zip.getEntry('trips.txt');
  const stopTimesEntry = zip.getEntry('stop_times.txt');
  const shapesEntry = zip.getEntry('shapes.txt');

  const routes = routesEntry ? parseCsv(routesEntry.getData()) : [];
  const stops = stopsEntry ? parseCsv(stopsEntry.getData()) : [];
  const trips = tripsEntry ? parseCsv(tripsEntry.getData()) : [];
  const stopTimesData = stopTimesEntry ? parseCsv(stopTimesEntry.getData()) : [];
  const shapesData = shapesEntry ? parseCsv(shapesEntry.getData()) : [];

  console.log(`[GTFS] Parsed: ${routes.length} routes, ${stops.length} stops, ${trips.length} trips, ${stopTimesData.length} stop_times, ${shapesData.length} shape points`);

  // Tier 1: find Metro route by route_type or name
  metroRouteIds = findMetroRouteIds(routes);
  console.log(`[GTFS] Tier 1 route detection: found ${metroRouteIds.length} route(s): ${metroRouteIds.join(', ')}`);

  // Tier 2 fallback
  if (metroRouteIds.length === 0) {
    console.log('[GTFS] Tier 1 failed, trying Tier 2 (stop name matching)...');
    metroRouteIds = findMetroRouteIdsByStops(stops, stopTimesData, trips);
    console.log(`[GTFS] Tier 2 route detection: found ${metroRouteIds.length} route(s): ${metroRouteIds.join(', ')}`);
  }

  if (metroRouteIds.length === 0) {
    console.warn('[GTFS] No Metro routes found!');
    ready = true;
    return;
  }

  // Filter trips for Metro routes
  const routeIdSet = new Set(metroRouteIds);
  const metroTrips = trips.filter(t => routeIdSet.has(t.route_id));
  metroTripIds = new Set(metroTrips.map(t => t.trip_id));
  console.log(`[GTFS] Found ${metroTripIds.size} Metro trips`);

  // Get shape_ids from Metro trips
  const shapeIds = new Set(metroTrips.map(t => t.shape_id).filter(Boolean));
  console.log(`[GTFS] Found ${shapeIds.size} shape ID(s): ${[...shapeIds].join(', ')}`);

  // Extract Metro stops from stop_times
  const metroStopTimesFiltered = stopTimesData.filter(st => metroTripIds.has(st.trip_id));
  const metroStopIds = new Set(metroStopTimesFiltered.map(st => st.stop_id));

  metroStops = stops
    .filter(s => metroStopIds.has(s.stop_id))
    .map(s => ({
      stop_id: s.stop_id,
      stop_name: s.stop_name,
      lat: parseFloat(s.stop_lat),
      lon: parseFloat(s.stop_lon),
    }))
    .filter(s => !isNaN(s.lat) && !isNaN(s.lon));

  console.log(`[GTFS] Found ${metroStops.length} Metro stops`);

  // Build stop_times map for interpolation
  for (const st of metroStopTimesFiltered) {
    if (!metroStopTimes.has(st.trip_id)) {
      metroStopTimes.set(st.trip_id, []);
    }
    metroStopTimes.get(st.trip_id).push({
      stop_id: st.stop_id,
      arrival_time: parseTimeToSeconds(st.arrival_time),
      departure_time: parseTimeToSeconds(st.departure_time),
      stop_sequence: parseInt(st.stop_sequence),
    });
  }
  // Sort each trip's stops by sequence
  for (const [, stList] of metroStopTimes) {
    stList.sort((a, b) => a.stop_sequence - b.stop_sequence);
  }

  // Extract shapes
  if (shapeIds.size > 0) {
    const metroShapes = shapesData.filter(s => shapeIds.has(s.shape_id));
    const grouped = new Map();
    for (const pt of metroShapes) {
      if (!grouped.has(pt.shape_id)) grouped.set(pt.shape_id, []);
      grouped.get(pt.shape_id).push({
        seq: parseInt(pt.shape_pt_sequence),
        lon: parseFloat(pt.shape_pt_lon),
        lat: parseFloat(pt.shape_pt_lat),
      });
    }
    metroRouteShape.paths = [];
    for (const [, points] of grouped) {
      points.sort((a, b) => a.seq - b.seq);
      metroRouteShape.paths.push(points.map(p => [p.lon, p.lat]));
    }
    console.log(`[GTFS] Extracted ${metroRouteShape.paths.length} shape path(s) with ${metroRouteShape.paths.reduce((s, p) => s + p.length, 0)} total points`);
  }

  // Fallback: if no shapes, build path from stop coordinates in route order
  if (metroRouteShape.paths.length === 0 && metroStops.length > 0) {
    console.warn('[GTFS] No shape data found, using stop coordinates as fallback path');
    // Try to order stops using the first trip's stop_times
    const firstTrip = metroStopTimes.entries().next().value;
    if (firstTrip) {
      const [, stopTimesList] = firstTrip;
      const stopMap = new Map(metroStops.map(s => [s.stop_id, s]));
      const orderedPath = stopTimesList
        .map(st => stopMap.get(st.stop_id))
        .filter(Boolean)
        .map(s => [s.lon, s.lat]);
      if (orderedPath.length > 0) {
        metroRouteShape.paths = [orderedPath];
      }
    }
    if (metroRouteShape.paths.length === 0) {
      metroRouteShape.paths = [metroStops.map(s => [s.lon, s.lat])];
    }
  }

  ready = true;
  console.log('[GTFS] Static data ready');
}

export function getMetroStops() { return metroStops; }
export function getMetroRouteShape() { return metroRouteShape; }
export function getMetroRouteIds() { return metroRouteIds; }
export function getMetroTripIds() { return metroTripIds; }
export function getMetroStopTimes() { return metroStopTimes; }
export function isReady() { return ready; }
