export default function Legend() {
  const items = [
    { color: '#ffb800', label: 'Route' },
    { color: '#ffffff', label: 'Stop' },
    { color: '#00a0dc', label: 'Tram' },
  ];

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0, 0, 0, 0.75)',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: 20,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: 12,
      display: 'flex',
      gap: 16,
      alignItems: 'center',
      zIndex: 1,
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
    }}>
      {items.map(({ color, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-block',
            width: label === 'Route' ? 16 : 10,
            height: label === 'Route' ? 3 : 10,
            borderRadius: label === 'Route' ? 2 : '50%',
            background: color,
          }} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
