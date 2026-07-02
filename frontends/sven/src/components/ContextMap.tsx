// Statische context-map. Pijlen lichten op als de bijbehorende demo-stap loopt.
// Pijl-id's komen overeen met DemoStep.arrows.
const NODES: Record<string, { x: number; y: number; label: string }> = {
  beheer:     { x: 90,  y: 45,  label: 'Beheer' },
  monitoring: { x: 330, y: 45,  label: 'Monitoring' },
  contract:   { x: 90,  y: 215, label: 'Contract' },
  onderhoud:  { x: 330, y: 215, label: 'Onderhoud' },
};

interface Edge { id: string; from: string; to: string; label: string; }
const EDGES: Edge[] = [
  { id: 'beheer-contract',    from: 'beheer',     to: 'contract',   label: 'kunstwerk/eisen' },
  { id: 'beheer-monitoring',  from: 'beheer',     to: 'monitoring', label: 'kunstwerk/eisen' },
  { id: 'beheer-onderhoud',   from: 'beheer',     to: 'onderhoud',  label: 'kunstwerk/eisen' },
  { id: 'monitoring-onderhoud', from: 'monitoring', to: 'onderhoud', label: 'incident' },
  { id: 'monitoring-beheer',  from: 'monitoring', to: 'beheer',     label: 'rapport' },
  { id: 'monitoring-contract',from: 'monitoring', to: 'contract',   label: 'rapport/KPI' },
  { id: 'contract-onderhoud', from: 'contract',   to: 'onderhoud',  label: 'gegund' },
  { id: 'onderhoud-beheer',   from: 'onderhoud',  to: 'beheer',     label: 'onderhoudsrapport' },
];

// Kleine offset zodat heen- en terugpijlen tussen dezelfde nodes niet overlappen.
function edgeGeom(e: Edge) {
  const a = NODES[e.from];
  const b = NODES[e.to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len; // normaal
  const ny = dx / len;
  const off = 10;
  const pad = 46;
  const x1 = a.x + (dx / len) * pad + nx * off;
  const y1 = a.y + (dy / len) * pad + ny * off;
  const x2 = b.x - (dx / len) * pad + nx * off;
  const y2 = b.y - (dy / len) * pad + ny * off;
  return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

export function ContextMap({ active }: { active: Set<string> }) {
  return (
    <svg className="ctx-map" viewBox="0 0 420 260" role="img" aria-label="Context-map">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#5b6b7a" />
        </marker>
        <marker id="arrow-on" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill="#f9e11e" />
        </marker>
      </defs>

      {EDGES.map(e => {
        const g = edgeGeom(e);
        const on = active.has(e.id);
        return (
          <g key={e.id} className={on ? 'edge edge--on' : 'edge'}>
            <line
              x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}
              stroke={on ? '#f9e11e' : '#3a4753'}
              strokeWidth={on ? 3 : 1.5}
              markerEnd={on ? 'url(#arrow-on)' : 'url(#arrow)'}
            />
            {on && <text x={g.mx} y={g.my - 3} className="edge__label">{e.label}</text>}
          </g>
        );
      })}

      {Object.entries(NODES).map(([id, n]) => (
        <g key={id}>
          <rect x={n.x - 44} y={n.y - 18} width={88} height={36} rx={6} className={`node node--${id}`} />
          <text x={n.x} y={n.y + 4} className="node__label">{n.label}</text>
        </g>
      ))}
    </svg>
  );
}
