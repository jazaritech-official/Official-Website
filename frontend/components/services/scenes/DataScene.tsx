import { SceneFrame, at, C } from "./SceneFrame";

/**
 * DATA AND ANALYTICS — data dots stream through a pipe into a warehouse
 * cylinder, a dashboard assembles (donut sweeps, bars and a sparkline draw), a
 * filter chip toggles and the charts re-animate. Story: collect → store → model
 * → decide.
 */
export default function DataScene() {
  return (
    <SceneFrame className="sc-data">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Pipe */}
      <path d="M 34 60 L 132 60" stroke="var(--vip-soft)" strokeOpacity="0.3" strokeWidth="10" strokeLinecap="round" />
      <path
        d="M 34 60 L 132 60"
        stroke={C[2]}
        strokeWidth="2"
        pathLength={1}
        className="s-draw"
        style={at(0.2, 5.4)}
      />
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <g key={index} transform="translate(34 60)">
          <g className="s-sweep" style={at(0.4 + index * 0.28, 5.4)}>
            <circle r="2.6" fill={index % 2 === 0 ? C[2] : C[3]} />
          </g>
        </g>
      ))}

      {/* Warehouse cylinder */}
      <g transform="translate(150 36)">
        <ellipse cx="24" cy="10" rx="24" ry="9" fill={C[3]} opacity="0.35" />
        <path d="M 0 10 v 44 a 24 9 0 0 0 48 0 v -44" fill={C[3]} opacity="0.2" stroke={C[3]} strokeOpacity="0.55" />
        <ellipse cx="24" cy="10" rx="24" ry="9" fill="none" stroke={C[3]} strokeOpacity="0.7" />
        {[0, 1, 2].map((index) => (
          <line key={index} x1="2" y1={24 + index * 12} x2="46" y2={24 + index * 12} stroke={C[3]} strokeOpacity="0.35" />
        ))}
      </g>
      <g className="s-pulse" style={at(1.6, 3.2)}>
        <rect x="158" y="34" width="32" height="4" rx="2" fill={C[7]} />
      </g>

      {/* Dashboard */}
      <g className="s-up" style={at(1.8)}>
        <rect x="216" y="30" width="190" height="120" rx="12" fill="#0d1430" stroke={C[1]} strokeOpacity="0.45" />
      </g>

      {/* Donut sweeps */}
      <g transform="translate(258 74)">
        <circle r="22" fill="none" stroke="var(--vip-grid)" strokeWidth="8" />
        <circle
          r="22"
          fill="none"
          stroke={C[4]}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray="138"
          strokeDashoffset="138"
          transform="rotate(-90)"
          className="s-draw"
          style={at(2, 5.4)}
        />
        <circle r="10" fill="none" stroke={C[3]} strokeOpacity="0.5" />
      </g>

      {/* Bars */}
      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={294 + index * 20}
          y={96 - index * 10}
          width="12"
          height={20 + index * 10}
          rx="3"
          fill={index % 2 === 0 ? C[2] : C[5]}
          opacity="0.85"
          className="s-grow"
          style={at(2.2 + index * 0.18)}
        />
      ))}

      {/* Sparkline */}
      <path
        d="M 224 138 L 254 128 L 284 134 L 314 118 L 344 124 L 374 110 L 398 116"
        fill="none"
        stroke={C[7]}
        strokeWidth="1.8"
        strokeLinecap="round"
        pathLength={1}
        className="s-draw"
        style={at(2.6, 5.4)}
      />

      {/* Filter chip */}
      <g className="s-tick" style={at(3.2)}>
        <rect x="222" y="52" width="52" height="18" rx="9" fill={C[5]} opacity="0.22" stroke={C[5]} strokeOpacity="0.6" />
        <rect x="232" y="59" width="26" height="4" rx="2" fill={C[5]} opacity="0.85" />
      </g>
    </SceneFrame>
  );
}
