import { useState, useEffect } from 'react';

export function useTramPositions(intervalMs = 5000) {
  const [trams, setTrams] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch('/api/trams');
        const data = await res.json();
        if (!active) return;
        // Sort by id for stable deck.gl transitions
        const sorted = (data.trams || []).sort((a, b) =>
          String(a.id).localeCompare(String(b.id))
        );
        setTrams(sorted);
        setLastUpdated(data.lastUpdated);
        setIsSimulated(data.simulated || false);
      } catch (e) {
        console.error('Failed to fetch trams:', e);
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { trams, lastUpdated, isSimulated };
}
