import { useState, useEffect, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { Map } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const INITIAL_VIEW_STATE = {
  longitude: -1.8998,
  latitude: 52.4796,
  zoom: 11,
  pitch: 0,
  bearing: 0,
};

export default function MetroMap({ maptilerKey, trams }) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [stops, setStops] = useState([]);
  const [routePaths, setRoutePaths] = useState([]);

  useEffect(() => {
    fetch('/api/stops')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setStops(data);
      })
      .catch(err => console.error('Failed to fetch stops:', err));
  }, []);

  useEffect(() => {
    fetch('/api/route-shape')
      .then(r => r.json())
      .then(data => {
        if (data.paths) {
          setRoutePaths(data.paths.map((path, i) => ({ id: i, path })));
        }
      })
      .catch(err => console.error('Failed to fetch route shape:', err));
  }, []);

  const onViewStateChange = useCallback(({ viewState: vs }) => {
    setViewState(vs);
  }, []);

  const getTooltip = useCallback(({ object }) => {
    if (!object) return null;
    if (object.stop_name) return object.stop_name;
    if (object.id) return `Tram ${object.id}${object.nextStop ? ` → ${object.nextStop}` : ''}`;
    return null;
  }, []);

  const layers = [
    // Route line (gold)
    new PathLayer({
      id: 'route-layer',
      data: routePaths,
      getPath: d => d.path,
      getColor: [255, 184, 0],
      getWidth: 4,
      widthUnits: 'pixels',
      capRounded: true,
      jointRounded: true,
    }),

    // Stop markers (white dots)
    new ScatterplotLayer({
      id: 'stops-layer',
      data: stops,
      getPosition: d => [d.lon, d.lat],
      getFillColor: [255, 255, 255],
      getRadius: 6,
      radiusUnits: 'pixels',
      pickable: true,
    }),

    // Stop name labels (visible at zoom > 12)
    new TextLayer({
      id: 'stop-names-layer',
      data: stops,
      getPosition: d => [d.lon, d.lat],
      getText: d => d.stop_name,
      getColor: [255, 255, 255, 200],
      getSize: 12,
      sizeUnits: 'pixels',
      getTextAnchor: 'start',
      getAlignmentBaseline: 'center',
      getPixelOffset: [10, 0],
      visible: viewState.zoom > 12,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: 'bold',
      outlineColor: [0, 0, 0, 220],
      outlineWidth: 2,
    }),

    // Tram dots (blue with white border)
    new ScatterplotLayer({
      id: 'trams-layer',
      data: trams,
      getPosition: d => [d.lon, d.lat],
      getFillColor: [0, 160, 220],
      getLineColor: [255, 255, 255],
      getRadius: 12,
      radiusUnits: 'pixels',
      stroked: true,
      lineWidthMinPixels: 2,
      pickable: true,
      transitions: {
        getPosition: { duration: 4000, easing: t => t },
      },
    }),
  ];

  const mapStyle = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${maptilerKey}`;

  return (
    <DeckGL
      viewState={viewState}
      onViewStateChange={onViewStateChange}
      controller={true}
      layers={layers}
      getTooltip={getTooltip}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Map
        mapStyle={mapStyle}
        attributionControl={true}
      />
    </DeckGL>
  );
}
