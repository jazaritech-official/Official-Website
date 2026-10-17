import { SceneFrame, at, C } from "./SceneFrame";

/**
 * GRAPHIC DESIGNING — a pen tool draws a bezier, the shape fills, a swatch fan
 * opens, the shape settles into a mark and a bounding box with corner handles
 * slides into place. Story: draw → colour → refine → frame.
 */
export default function DesignScene() {
  return (
    <SceneFrame className="sc-design">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Canvas */}
      <rect x="30" y="30" width="200" height="130" rx="10" fill="#0d1430" stroke={C[3]} strokeOpacity="0.3" />
      {[0, 1, 2, 3].map((row) => (
        <line key={row} x1="42" y1={50 + row * 28} x2="218" y2={50 + row * 28} stroke="var(--vip-soft)" strokeOpacity="0.1" />
      ))}

      {/* The drawn bezier + its fill */}
      <g className="s-pop" style={at(1.35)}>
        <path d="M 62 128 C 84 62 150 62 176 96 C 196 122 148 142 108 138 Z" fill={C[3]} opacity="0.32" />
      </g>
      <path
        d="M 62 128 C 84 62 150 62 176 96 C 196 122 148 142 108 138 Z"
        fill="none"
        stroke={C[4]}
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        className="s-draw"
        style={at(0.2)}
      />

      {/* Anchor handles */}
      {[
        [62, 128],
        [176, 96],
        [108, 138],
      ].map(([x, y], index) => (
        <g key={`${x}-${y}`} className="s-pop" style={at(0.4 + index * 0.3)}>
          <rect x={x - 3.5} y={y - 3.5} width="7" height="7" fill="#0d1430" stroke={C[2]} strokeWidth="1.4" />
        </g>
      ))}
      <g className="s-tick" style={at(1.1)}>
        <circle cx="84" cy="62" r="3" fill={C[2]} />
        <line x1="84" y1="62" x2="64" y2="80" stroke={C[2]} strokeWidth="1" />
      </g>

      {/* Swatch fan */}
      <g className="s-pop" style={at(1.9)}>
        <rect x="252" y="96" width="30" height="30" rx="6" fill={C[4]} opacity="0.9" />
      </g>
      <g className="s-pop" style={at(2.05)}>
        <rect x="274" y="80" width="30" height="30" rx="6" fill={C[3]} opacity="0.9" />
      </g>
      <g className="s-pop" style={at(2.2)}>
        <rect x="296" y="64" width="30" height="30" rx="6" fill={C[5]} opacity="0.9" />
      </g>
      <g className="s-pop" style={at(2.35)}>
        <rect x="318" y="48" width="30" height="30" rx="6" fill={C[2]} opacity="0.9" />
      </g>

      {/* Bounding box + ruler guides */}
      <g className="s-in" style={at(2.7)}>
        <rect x="56" y="56" width="126" height="88" fill="none" stroke={C[2]} strokeWidth="1" strokeDasharray="3 4" />
        {[
          [56, 56],
          [182, 56],
          [56, 144],
          [182, 144],
        ].map(([x, y], index) => (
          <rect key={index} x={x - 3} y={y - 3} width="6" height="6" fill={C[2]} />
        ))}
      </g>
      <line
        x1="30"
        y1="40"
        x2="230"
        y2="40"
        stroke={C[4]}
        strokeWidth="1.2"
        pathLength={1}
        className="s-draw"
        style={at(2.9, 6)}
      />

      {/* Drafting marks */}
      <g className="s-up" style={at(3.1)}>
        <rect x="356" y="110" width="56" height="6" rx="3" fill={C[7]} opacity="0.8" />
        <rect x="356" y="126" width="38" height="6" rx="3" fill="var(--vip-soft)" opacity="0.45" />
        <rect x="356" y="142" width="46" height="6" rx="3" fill="var(--vip-soft)" opacity="0.3" />
      </g>
    </SceneFrame>
  );
}
