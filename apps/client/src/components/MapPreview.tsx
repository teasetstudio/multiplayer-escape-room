import { tileToWorld, worldToScreen, type Point } from '@escape/shared';

const project = (x: number, y: number) => worldToScreen(tileToWorld({ x, y }));
const points = (vertices: Point[]) => vertices.map((point) => `${point.x},${point.y}`).join(' ');

export function MapPreview() {
  const people = [
    { ...project(2, 2), name: 'Lily', color: '#c5f277' },
    { ...project(6, 2.5), name: 'Mike', color: '#b298ed' },
    { ...project(3, 5.5), name: 'Nick', color: '#86b9ed' },
    { ...project(7, 6), name: 'Alex', color: '#edaa81' },
  ];
  return (
    <div className="map-preview">
      <div className="preview-top">
        <span>
          <i />A space for everyone
        </span>
        <span>ROOM A / TWIN VAULTS</span>
      </div>
      <svg
        viewBox="0 0 620 450"
        role="img"
        aria-label="Preview: four colored explorers in an isometric stone room"
      >
        <g transform="translate(290 94)">
          {Array.from({ length: 72 }, (_, index) => {
            const x = index % 9;
            const y = Math.floor(index / 9);
            return (
              <polygon
                key={index}
                points={points([
                  project(x, y),
                  project(x + 1, y),
                  project(x + 1, y + 1),
                  project(x, y + 1),
                ])}
                fill={index % 7 === 0 ? '#4b605b' : '#455957'}
                stroke="#62776d"
                strokeWidth=".6"
              />
            );
          })}
          {[
            [project(0, 0), project(9, 0)],
            [project(0, 0), project(0, 8)],
          ].map(([a, b], index) => (
            <polygon
              key={index}
              points={points([a!, b!, { x: b!.x, y: b!.y - 30 }, { x: a!.x, y: a!.y - 30 }])}
              fill={index ? '#63736e' : '#4d5d5b'}
              stroke="#89968d"
              strokeWidth="2"
            />
          ))}
          {people.map((person) => (
            <g key={person.name} transform={`translate(${person.x} ${person.y})`}>
              <ellipse cy="2" rx="15" ry="7" fill="#132724" opacity=".6" />
              <path d="M-7-30H7L14-3 0 0-14-3Z" fill={person.color} />
              <path d="m0-26 7-4 7 27L0 0Z" fill="#233e39" opacity=".2" />
              <circle cy="-34" r="10" fill={person.color} />
              <ellipse cy="-32" rx="5" ry="6" fill="#dac9ae" />
              <text
                y="-53"
                textAnchor="middle"
                fill="#e3ebda"
                fontFamily="Arial, sans-serif"
                fontSize="14"
              >
                {person.name}
              </text>
            </g>
          ))}
        </g>
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
