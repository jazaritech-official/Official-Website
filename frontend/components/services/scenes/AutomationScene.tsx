import { SceneFrame, at, C } from "./SceneFrame";

/**
 * AUTOMATION — interlocking gears rotate, task cards ride a conveyor into a
 * workflow of nodes, each node ticks, a clock sweeps and a "0 manual steps"
 * badge pulses. Story: trigger → run → check → repeat.
 */
export default function AutomationScene() {
  return (
    <SceneFrame className="sc-automation">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Gears */}
      <g transform="translate(76 86)">
        <g className="s-spin" style={at(0, 8)}>
          <circle r="26" fill={C[1]} opacity="0.28" stroke={C[1]} strokeOpacity="0.6" strokeWidth="1.6" />
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (index / 8) * Math.PI * 2;
            return (
              <rect
                key={index}
                x="-4"
                y="-31"
                width="8"
                height="10"
                rx="2"
                fill={C[1]}
                opacity="0.9"
                transform={`rotate(${(angle * 180) / Math.PI})`}
              />
            );
          })}
          <circle r="9" fill="#0d1430" stroke={C[2]} strokeOpacity="0.6" />
        </g>
        <g className="s-spin-back" style={at(0, 5.6)}>
          <g transform="translate(34 24)">
            <circle r="16" fill={C[2]} opacity="0.24" stroke={C[2]} strokeOpacity="0.6" strokeWidth="1.4" />
            {Array.from({ length: 6 }, (_, index) => {
              const angle = (index / 6) * Math.PI * 2;
              return (
                <rect
                  key={index}
                  x="-3"
                  y="-20"
                  width="6"
                  height="7"
                  rx="2"
                  fill={C[2]}
                  opacity="0.9"
                  transform={`rotate(${(angle * 180) / Math.PI})`}
                />
              );
            })}
            <circle r="5.5" fill="#0d1430" />
          </g>
        </g>
      </g>

      {/* Conveyor with task cards */}
      <line x1="140" y1="140" x2="424" y2="140" stroke="var(--vip-soft)" strokeOpacity="0.28" strokeWidth="4" strokeLinecap="round" />
      {[0, 1, 2].map((index) => (
        <g key={index} className="s-carry" style={at(0.6 + index * 0.9, 5.4)}>
          <rect x="150" y="108" width="30" height="26" rx="6" fill={index % 2 === 0 ? C[7] : C[2]} opacity="0.85" />
          <rect x="156" y="116" width="18" height="4" rx="2" fill="#0d1430" opacity="0.4" />
          <rect x="156" y="124" width="12" height="4" rx="2" fill="#0d1430" opacity="0.3" />
        </g>
      ))}

      {/* Workflow nodes */}
      {[0, 1, 2].map((index) => (
        <g key={`node-${index}`} className="s-up" style={at(1.4 + index * 0.28)}>
          <rect x={252 + index * 54} y="42" width="42" height="42" rx="10" fill="#0d1430" stroke={C[2]} strokeOpacity="0.45" />
          <rect x={262 + index * 54} y="54" width="22" height="6" rx="3" fill={C[2]} opacity="0.8" />
          <rect x={266 + index * 54} y="66" width="14" height="6" rx="3" fill="var(--vip-soft)" opacity="0.4" />
        </g>
      ))}
      {[0, 1].map((index) => (
        <path
          key={`link-${index}`}
          d={`M ${294 + index * 54} 63 L ${306 + index * 54} 63`}
          stroke={C[2]}
          strokeWidth="1.6"
          pathLength={1}
          className="s-draw"
          style={at(1.7 + index * 0.28)}
        />
      ))}
      {[0, 1, 2].map((index) => (
        <g key={`tick-${index}`} className="s-tick" style={at(2.2 + index * 0.28, 5.4)}>
          <path
            d={`M ${268 + index * 54} 63 l 4 4 l 8 -9`}
            fill="none"
            stroke={C[7]}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      ))}

      {/* Clock */}
      <g transform="translate(392 78)">
        <circle r="22" fill="none" stroke={C[5]} strokeOpacity="0.45" strokeWidth="1.4" />
        <g className="s-spin" style={at(0, 4.2)}>
          <line x1="0" y1="0" x2="0" y2="-13" stroke={C[5]} strokeWidth="2" strokeLinecap="round" />
        </g>
        <line x1="0" y1="0" x2="8" y2="6" stroke={C[5]} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      </g>

      {/* "0 manual steps" badge */}
      <g className="s-pulse" style={at(2.6, 5.4)}>
        <rect x="252" y="100" width="150" height="26" rx="10" fill={C[7]} opacity="0.14" stroke={C[7]} strokeOpacity="0.5" />
        <rect x="264" y="110" width="72" height="6" rx="3" fill={C[7]} opacity="0.75" />
        <rect x="346" y="110" width="44" height="6" rx="3" fill="var(--vip-text)" opacity="0.3" />
      </g>
    </SceneFrame>
  );
}
