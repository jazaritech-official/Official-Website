import { SceneFrame, at, C } from "./SceneFrame";

/**
 * CLOUD AND DEVOPS — a pipeline of stages (Commit → Build → Test → Deploy) with
 * a token travelling stage to stage, each stage turning to a green check, a
 * cloud with container blocks stacking and instances duplicating.
 * Story: commit → build → test → ship → scale.
 */
export default function CloudScene() {
  const stages = [0, 1, 2, 3];
  return (
    <SceneFrame className="sc-cloud">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Pipeline rail */}
      <line x1="40" y1="64" x2="240" y2="64" stroke="var(--vip-soft)" strokeOpacity="0.3" strokeWidth="1.4" />
      <line
        x1="40"
        y1="64"
        x2="240"
        y2="64"
        stroke={C[2]}
        strokeWidth="2"
        pathLength={1}
        className="s-draw"
        style={at(0.2, 5.4)}
      />
      {stages.map((index) => (
        <g key={index}>
          <circle cx={46 + index * 62} cy="64" r="12" fill="#0d1430" stroke={C[2]} strokeOpacity="0.5" strokeWidth="1.4" />
          <g className="s-tick" style={at(0.6 + index * 0.5, 5.4)}>
            <path
              d={`M ${41 + index * 62} 64 l 3.5 3.5 l 6.5 -7`}
              fill="none"
              stroke={C[7]}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <rect x={34 + index * 62} y="82" width="24" height="5" rx="2.5" fill="var(--vip-soft)" opacity="0.35" />
        </g>
      ))}

      {/* The travelling token */}
      <g transform="translate(46 64)">
        <g className="s-sweep" style={at(0.4, 5.4)}>
          <circle r="4.5" fill={C[5]} />
        </g>
      </g>

      {/* Cloud with container blocks stacking */}
      <path
        d="M 288 96 a 20 20 0 0 1 20 -20 a 24 24 0 0 1 44 6 a 17 17 0 0 1 -3 33 h -48 a 17 17 0 0 1 -13 -19 z"
        fill={C[1]}
        opacity="0.28"
        stroke={C[1]}
        strokeOpacity="0.5"
        className="s-in"
        style={at(1.6)}
      />
      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={296 + index * 18}
          y={124 - index * 6}
          width="16"
          height="16"
          rx="3"
          fill={index % 2 === 0 ? C[2] : C[1]}
          opacity={0.8}
          className="s-pop"
          style={at(1.8 + index * 0.22)}
        />
      ))}

      {/* Instances duplicating */}
      {[0, 1, 2].map((index) => (
        <g key={index} className="s-pop" style={at(2.6 + index * 0.4)}>
          <rect x={300 + index * 36} y="148" width="26" height="16" rx="5" fill="#0d1430" stroke={C[7]} strokeOpacity="0.55" />
          <circle cx={307 + index * 36} cy="156" r="2.6" fill={C[7]} className="s-pulse" style={at(2.8 + index * 0.4, 2.6)} />
        </g>
      ))}

      {/* Scale arrow */}
      <path
        d="M 268 140 L 268 108"
        stroke={C[5]}
        strokeWidth="1.4"
        strokeDasharray="4 4"
        pathLength={1}
        className="s-draw"
        style={at(2.3, 5.4)}
      />
    </SceneFrame>
  );
}
