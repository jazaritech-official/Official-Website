import { SceneFrame, at, C } from "./SceneFrame";

/**
 * CYBERSECURITY — a shield with a scanning beam sweeping, threat glyphs
 * approaching and being deflected with small bursts, a padlock closing and a log
 * column turning from amber to cleared. Story: watch → scan → deflect → secure.
 */
export default function SecurityScene() {
  return (
    <SceneFrame className="sc-security">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Shield */}
      <path
        d="M 128 32 L 196 52 L 196 104 C 196 136 164 154 128 164 C 92 154 60 136 60 104 L 60 52 Z"
        fill={C[1]}
        opacity="0.24"
        stroke={C[2]}
        strokeOpacity="0.6"
        strokeWidth="1.6"
        className="s-in"
        style={at(0.2)}
      />
      <path
        d="M 128 32 L 196 52 L 196 104 C 196 136 164 154 128 164 C 92 154 60 136 60 104 L 60 52 Z"
        fill="none"
        stroke={C[2]}
        strokeWidth="2"
        pathLength={1}
        className="s-draw"
        style={at(0.3, 5.4)}
      />
      <g className="s-pop" style={at(2.6)}>
        <rect x="112" y="86" width="32" height="26" rx="6" fill={C[7]} opacity="0.85" />
        <path d="M 118 86 v -8 a 10 10 0 0 1 20 0 v 8" fill="none" stroke={C[7]} strokeWidth="3" strokeLinecap="round" />
      </g>

      {/* Scanning beam */}
      <g transform="translate(128 98)">
        <g className="s-spin" style={at(0.4, 4.6)}>
          <path d="M 0 0 L 0 -78" stroke={C[2]} strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" />
          <path d="M 0 0 L 0 -78" stroke={C[2]} strokeWidth="8" strokeOpacity="0.12" strokeLinecap="round" />
        </g>
      </g>

      {/* Threat glyphs deflected */}
      {[0, 1, 2].map((index) => (
        <g key={index} className="s-arc" style={at(0.8 + index * 0.9, 5.4)}>
          <g transform={`translate(${220 + index * 4} ${40 + index * 44})`}>
            <path d="M 0 0 l 10 0 l -5 8 z" fill={C[6]} opacity="0.9" />
          </g>
        </g>
      ))}
      {[0, 1, 2].map((index) => (
        <g key={`burst-${index}`} className="s-tick" style={at(1.5 + index * 0.9, 5.4)}>
          <circle cx={188} cy={48 + index * 44} r="6" fill="none" stroke={C[6]} strokeWidth="1.4" />
          <circle cx={188} cy={48 + index * 44} r="2" fill={C[6]} />
        </g>
      ))}

      {/* Log column: amber → cleared */}
      <g className="s-up" style={at(0.5)}>
        <rect x="288" y="30" width="118" height="96" rx="10" fill="#0d1430" stroke={C[2]} strokeOpacity="0.35" />
        {[0, 1, 2, 3, 4].map((index) => (
          <rect
            key={index}
            x="300"
            y={42 + index * 16}
            width={index === 4 ? 84 : 70 - index * 6}
            height="6"
            rx="3"
            fill={index < 3 ? C[5] : C[7]}
            opacity={index < 3 ? 0.65 : 0.9}
            className="s-light"
            style={at(1.6 + index * 0.2)}
          />
        ))}
      </g>
      <g className="s-pop" style={at(3)}>
        <rect x="288" y="140" width="118" height="26" rx="9" fill={C[7]} opacity="0.14" stroke={C[7]} strokeOpacity="0.5" />
        <path d="M 302 153 l 5 5 l 9 -12" fill="none" stroke={C[7]} strokeWidth="2" strokeLinecap="round" />
        <rect x="326" y="150" width="60" height="6" rx="3" fill={C[7]} opacity="0.7" />
      </g>
    </SceneFrame>
  );
}
