import { SceneFrame, at, C } from "./SceneFrame";

/**
 * UI/UX DESIGN — a wireframe becomes a polished UI, a cursor drags a component
 * that snaps to the grid with alignment guides flashing, a user flow connects
 * three screens, a heatmap blob fades over a screen and a rating pops.
 * Story: wireframe → detail → flow → validate.
 */
export default function UiUxScene() {
  return (
    <SceneFrame className="sc-uiux">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Wireframe → polished */}
      <rect x="30" y="32" width="180" height="122" rx="10" fill="#0d1430" stroke={C[4]} strokeOpacity="0.35" />
      <g className="s-up" style={at(0.2)}>
        <rect x="42" y="44" width="156" height="16" rx="4" fill={C[4]} opacity="0.22" />
        <rect x="42" y="68" width="74" height="40" rx="6" fill={C[4]} opacity="0.16" />
        <rect x="124" y="68" width="74" height="40" rx="6" fill={C[4]} opacity="0.16" />
        <rect x="42" y="118" width="156" height="24" rx="6" fill={C[4]} opacity="0.12" />
      </g>
      {/* the "polish" layer cross-fades on top */}
      <g className="s-in" style={at(1.4, 5.4)}>
        <rect x="42" y="44" width="156" height="16" rx="4" fill={C[3]} opacity="0.75" />
        <rect x="42" y="68" width="74" height="40" rx="6" fill={C[3]} opacity="0.35" stroke={C[3]} strokeOpacity="0.6" />
        <rect x="124" y="68" width="74" height="40" rx="6" fill={C[2]} opacity="0.28" stroke={C[2]} strokeOpacity="0.6" />
        <rect x="42" y="118" width="60" height="16" rx="8" fill={C[3]} opacity="0.9" />
      </g>

      {/* Cursor dragging a component that snaps */}
      <g className="s-arc" style={at(2.2, 5.4)}>
        <path d="M 0 0 l 0 14 l 4 -4 l 3 6 l 3 -1.6 l -3 -6 l 5 -1 z" fill="var(--vip-text)" opacity="0.85" />
      </g>
      <g className="s-tick" style={at(3)}>
        <line x1="124" y1="48" x2="124" y2="146" stroke={C[6]} strokeWidth="1" strokeDasharray="3 4" />
        <line x1="198" y1="48" x2="198" y2="146" stroke={C[6]} strokeWidth="1" strokeDasharray="3 4" />
      </g>

      {/* Heatmap blob */}
      <ellipse cx="150" cy="96" rx="46" ry="30" fill={C[6]} opacity="0.16" className="s-pulse" style={at(3, 5.4)} />

      {/* Flow: three screens connected */}
      {[0, 1, 2].map((index) => (
        <g key={index} className="s-up" style={at(1.8 + index * 0.24)}>
          <rect x={234 + index * 62} y="40" width="52" height="38" rx="7" fill="#0d1430" stroke={C[2]} strokeOpacity="0.5" />
          <rect x={242 + index * 62} y="50" width="30" height="6" rx="3" fill={C[2]} opacity="0.75" />
          <rect x={242 + index * 62} y="62" width="20" height="6" rx="3" fill="var(--vip-soft)" opacity="0.4" />
        </g>
      ))}
      {[0, 1].map((index) => (
        <path
          key={index}
          d={`M ${290 + index * 62} 59 L ${292 + index * 62} 59`}
          stroke={C[4]}
          strokeWidth="1.6"
          pathLength={1}
          className="s-draw"
          style={at(2.2 + index * 0.24)}
        />
      ))}

      {/* Rating */}
      <g className="s-pop" style={at(3.4)}>
        <path
          d="M 348 112 l 5 11 l 12 1.6 l -9 8 l 2.4 12 l -10.4 -6 l -10.4 6 l 2.4 -12 l -9 -8 l 12 -1.6 z"
          fill={C[5]}
        />
        <rect x="322" y="146" width="52" height="6" rx="3" fill={C[5]} opacity="0.6" />
      </g>
    </SceneFrame>
  );
}
