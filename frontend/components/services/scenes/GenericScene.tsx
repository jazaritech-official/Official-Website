import { SceneFrame, at, C } from "./SceneFrame";

/**
 * GENERIC SCENE — the tasteful fallback for a service slug the registry does not
 * know yet (a brand-new backend service can never break the preview card). The
 * animated brand mark with orbiting nodes and a settling ring.
 */
export default function GenericScene() {
  return (
    <SceneFrame className="sc-generic">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Core mark */}
      <g transform="translate(220 95)">
        <g className="s-spin" style={at(0, 9)}>
          <circle r="52" fill="none" stroke={C[2]} strokeOpacity="0.35" strokeWidth="1.4" strokeDasharray="6 8" />
        </g>
        <g className="s-spin-back" style={at(0, 6.4)}>
          <circle r="36" fill="none" stroke={C[3]} strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="3 7" />
        </g>
        <path d="M -22 -8 L 0 -26 L 22 -8 L 0 10 Z" fill={C[1]} opacity="0.9" />
        <path d="M -22 8 L 0 -10 L 22 8 L 0 26 Z" fill={C[2]} opacity="0.85" />
        <circle r="5" fill={C[7]} className="s-pulse" style={at(0, 3.4)} />
      </g>

      {/* Orbiting nodes */}
      {[0, 1, 2, 3].map((index) => {
        const angle = (index / 4) * Math.PI * 2;
        return (
          <circle
            key={index}
            cx={220 + Math.cos(angle) * 84}
            cy={95 + Math.sin(angle) * 52}
            r="5"
            fill={index === 1 ? C[7] : C[3]}
            className="s-light"
            style={at(0.6 + index * 0.3)}
          />
        );
      })}

      {/* Settling ring */}
      <g className="s-pop" style={at(2.4, 5.4)}>
        <circle cx="220" cy="95" r="62" fill="none" stroke={C[7]} strokeWidth="1.4" strokeOpacity="0.5" />
      </g>

      {/* Side rails */}
      <g className="s-up" style={at(1.2)}>
        <rect x="30" y="52" width="44" height="86" rx="10" fill="#0d1430" stroke={C[2]} strokeOpacity="0.35" />
        <rect x="38" y="64" width="28" height="6" rx="3" fill={C[2]} opacity="0.6" />
        <rect x="38" y="78" width="20" height="6" rx="3" fill="var(--vip-soft)" opacity="0.35" />
        <rect x="366" y="52" width="44" height="86" rx="10" fill="#0d1430" stroke={C[2]} strokeOpacity="0.35" />
        <rect x="374" y="64" width="28" height="6" rx="3" fill={C[2]} opacity="0.6" />
        <rect x="374" y="78" width="20" height="6" rx="3" fill="var(--vip-soft)" opacity="0.35" />
      </g>

      {/* Connectors */}
      {[0, 1].map((index) => (
        <path
          key={index}
          d={index === 0 ? "M 74 84 L 150 95" : "M 366 84 L 290 95"}
          stroke={C[3]}
          strokeWidth="1.4"
          pathLength={1}
          className="s-flow"
          style={at(1.6 + index * 0.5, 5.4)}
        />
      ))}
    </SceneFrame>
  );
}
