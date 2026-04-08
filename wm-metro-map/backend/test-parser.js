import dotenv from 'dotenv';
dotenv.config();

import { init, getMetroStops, getMetroRouteShape, getMetroRouteIds, getMetroTripIds, isReady } from './gtfs-parser.js';

async function main() {
  await init();
  console.log('\n=== GTFS Parser Test Results ===');
  console.log('Ready:', isReady());
  console.log('Route IDs:', getMetroRouteIds());
  console.log('Trip count:', getMetroTripIds().size);

  const stops = getMetroStops();
  console.log(`\nStops (${stops.length}):`);
  for (const s of stops) {
    console.log(`  ${s.stop_name} (${s.lat}, ${s.lon})`);
  }

  const shape = getMetroRouteShape();
  console.log(`\nShapes: ${shape.paths.length} path(s)`);
  for (let i = 0; i < shape.paths.length; i++) {
    console.log(`  Path ${i}: ${shape.paths[i].length} points`);
    if (shape.paths[i].length > 0) {
      console.log(`    First: ${shape.paths[i][0]}`);
      console.log(`    Last: ${shape.paths[i][shape.paths[i].length - 1]}`);
    }
  }
}

main().catch(console.error);
