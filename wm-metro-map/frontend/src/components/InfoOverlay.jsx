export default function InfoOverlay({ tramCount, lastUpdated, isSimulated }) {
  const formatTime = (isoStr) => {
    if (!isoStr) return '--:--:--';
    try {
      return new Date(isoStr).toLocaleTimeString();
    } catch {
      return '--:--:--';
    }
  };

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      background: 'rgba(0, 0, 0, 0.75)',
      color: '#fff',
      padding: '16px 20px',
      borderRadius: 8,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 14,
      zIndex: 1,
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      minWidth: 200,
    }}>
      <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 4 }}>
        West Midlands Metro
      </div>
      <div style={{ fontSize: 12, color: '#aaa', marginBottom: 12 }}>
        Live Map
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: tramCount > 0 ? '#00a0dc' : '#666',
        }} />
        <span>{tramCount} tram{tramCount !== 1 ? 's' : ''} active</span>
      </div>
      <div style={{ fontSize: 12, color: '#aaa' }}>
        Updated: {formatTime(lastUpdated)}
      </div>
      {isSimulated && (
        <div style={{
          marginTop: 8,
          padding: '4px 8px',
          background: 'rgba(255, 184, 0, 0.2)',
          border: '1px solid rgba(255, 184, 0, 0.5)',
          borderRadius: 4,
          fontSize: 11,
          color: '#ffb800',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}>
          Simulated
        </div>
      )}
    </div>
  );
}
