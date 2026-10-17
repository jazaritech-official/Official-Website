import { SceneFrame, at, C } from "./SceneFrame";

/**
 * BUSINESS GROWTH — a chart on a dark grid.
 * Bars rise one after another, a trend line draws across and rides upward, an
 * arrow head glides along it, a KPI badge counts "+128%" into place and small
 * dots drift up. Story: measure → grow → accelerate → record.
 */
export default function GrowthScene() {
  const bars = [
    { x: 44, h: 34 },
    { x: 84, h: 52 },
    { x: 124, h: 44 },
    { x: 164, h: 74 },
    { x: 204, h: 96 },
  ];
  return (
    <SceneFrame className="sc-growth">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />
      {[0, 1, 2, 3].map((row) => (
        <line
          key={row}
          x1="34"
          y1={46 + row * 32}
          x2="270"
          y2={46 + row * 32}
          stroke="var(--vip-soft)"
          strokeOpacity="0.14"
          strokeWidth="1"
        />
      ))}
      <line x1="34" y1="152" x2="270" y2="152" stroke="var(--vip-soft)" strokeOpacity="0.4" strokeWidth="1.2" />

      {bars.map((bar, index) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={152 - bar.h}
          width="26"
          height={bar.h}
          rx="4"
          fill={index === bars.length - 1 ? C[7] : C[1]}
          fillOpacity={index === bars.length - 1 ? 0.95 : 0.55}
          className="s-grow"
          style={at(0.15 + index * 0.22)}
        />
      ))}

      <path
        d="M 57 118 L 97 96 L 137 104 L 177 74 L 217 52 L 253 40"
        fill="none"
        stroke={C[7]}
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        className="s-draw"
        style={at(1.5)}
      />
      {/* The arrow glides along the trend: the parent carries the slope, the
          child owns the only animated translate. */}
      <g transform="translate(57 118) rotate(-20)">
        <g className="s-sweep" style={at(1.9, 5.6)}>
          <path d="M 0 0 l 11 -5.5 l 0 11 z" fill={C[7]} />
        </g>
      </g>
      <circle cx="253" cy="40" r="4.5" fill={C[7]} className="s-pop" style={at(2.2)} />

      {/* KPI badge */}
      <g className="s-pop" style={at(2.4)}>
        <rect x="296" y="34" width="126" height="46" rx="10" fill="#0d1430" stroke={C[7]} strokeOpacity="0.5" />
        <rect x="310" y="48" width="58" height="10" rx="3" fill={C[7]} opacity="0.9" />
        <rect x="310" y="63" width="34" height="6" rx="3" fill="var(--vip-soft)" opacity="0.5" />
      </g>
      <g className="s-roll" style={at(2.5)}>
        <rect x="372" y="48" width="34" height="20" rx="4" fill={C[7]} opacity="0.18" />
      </g>

      {/* Secondary tiles */}
      <g className="s-up" style={at(2.8)}>
        <rect x="296" y="92" width="58" height="60" rx="10" fill="var(--vip-grid)" stroke={C[2]} strokeOpacity="0.4" />
        <rect x="306" y="126" width="38" height="16" rx="3" fill={C[2]} opacity="0.7" />
      </g>
      <g className="s-up" style={at(3)}>
        <rect x="364" y="92" width="58" height="60" rx="10" fill="var(--vip-grid)" stroke={C[5]} strokeOpacity="0.4" />
        <circle cx="393" cy="122" r="14" fill="none" stroke={C[5]} strokeWidth="3" strokeOpacity="0.75" />
      </g>

      {/* Drifting value dots */}
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <circle
          key={index}
          cx={286 + index * 4}
          cy={150 - index * 6}
          r="2.4"
          fill={C[5]}
          className="s-up"
          style={at(3.2 + index * 0.12)}
        />
      ))}
    </SceneFrame>
  );
}
