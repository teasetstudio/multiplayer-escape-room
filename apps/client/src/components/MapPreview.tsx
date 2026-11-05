export function MapPreview() {
  const people = [
    { x: 168, y: 138, name: 'Lily', color: '#c5f277' },
    { x: 392, y: 222, name: 'Mike', color: '#b298ed' },
    { x: 283, y: 337, name: 'Nick', color: '#86b9ed' },
    { x: 456, y: 106, name: 'Alex', color: '#edaa81' },
  ];
  return (
    <div className="map-preview">
      <div className="preview-top">
        <span>
          <i />A space for everyone
        </span>
        <span>01 / EXPLORATION</span>
      </div>
      <svg
        viewBox="0 0 620 450"
        role="img"
        aria-label="Preview: four colored players sharing a simple grid map"
      >
        <defs>
          <pattern id="preview-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#384b3d" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="30" y="28" width="560" height="394" rx="2" fill="#1b2b23" stroke="#607753" />
        <rect x="30" y="28" width="560" height="394" fill="url(#preview-grid)" />
        {people.map((person) => (
          <g key={person.name}>
            <ellipse cx={person.x} cy={person.y + 7} rx="22" ry="17" fill="#0c1710" />
            <circle cx={person.x} cy={person.y} r="18" fill={person.color} />
            <circle cx={person.x - 5} cy={person.y - 5} r="4" fill="#fff" opacity=".35" />
            <text
              x={person.x}
              y={person.y - 34}
              textAnchor="middle"
              fill="#e3ebda"
              fontFamily="Arial, sans-serif"
              fontSize="14"
            >
              {person.name}
            </text>
          </g>
        ))}
      </svg>
      <div className="preview-bottom">
        <span>Same map. Real connections.</span>
        <span className="preview-avatar-stack">
          {people.map((person) => (
            <i key={person.name} style={{ background: person.color }} />
          ))}
        </span>
      </div>
    </div>
  );
}
