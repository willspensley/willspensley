import { useState, useEffect } from 'react';
import MetroMap from './components/MetroMap';
import InfoOverlay from './components/InfoOverlay';
import Legend from './components/Legend';
import { useTramPositions } from './hooks/useTramPositions';
import './App.css';

function App() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);
  const { trams, lastUpdated, isSimulated } = useTramPositions(5000);

  useEffect(() => {
    fetch('/api/config')
      .then(r => {
        if (!r.ok) throw new Error(`Config fetch failed: ${r.status}`);
        return r.json();
      })
      .then(setConfig)
      .catch(err => {
        console.error('Failed to fetch config:', err);
        setError('Failed to connect to backend. Is the server running on port 3001?');
      });
  }, []);

  if (error) {
    return (
      <div className="loading">
        <div className="loading-text">{error}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="loading">
        <div className="loading-text">Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <MetroMap maptilerKey={config.maptilerKey} trams={trams} />
      <InfoOverlay
        tramCount={trams.length}
        lastUpdated={lastUpdated}
        isSimulated={isSimulated}
      />
      <Legend />
    </div>
  );
}

export default App;
