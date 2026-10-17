import { SceneFrame, at, C } from "./SceneFrame";

/**
 * MARKETING — a megaphone emits sound arcs, a funnel turns many dots into a few
 * brighter ones, an analytics tile shows CTR climbing and reach nodes light up
 * in a ring. Story: broadcast → filter → convert → amplify.
 */
export default function MarketingScene() {
  return (
    <SceneFrame className="sc-marketing">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Megaphone + arcs */}
      <g transform="translate(46 92)">
        <path d="M 0 -16 L 40 -30 L 40 30 L 0 16 Z" fill={C[6]} opacity="0.85" />
        <path d="M -8 -12 L 0 -16 L 0 16 L -8 12 Z" fill={C[5]} opacity="0.9" />
        {[0, 1, 2].map((index) => (
          <path
            key={index}
            d={`M ${48 + index * 12} ${-26 - index * 6} A ${34 + index * 12} ${34 + index * 12} 0 0 1 ${48 + index * 12} ${26 + index * 6}`}
            fill="none"
            stroke={C[5]}
            strokeWidth="1.6"
            pathLength={1}
            className="s-draw"
            style={at(0.4 + index * 0.28)}
          />
        ))}
      </g>

      {/* Funnel: many in, few brighter out */}
      <path d="M 208 40 L 268 40 L 248 92 L 248 104 L 228 104 L 228 92 Z" fill={C[1]} opacity="0.35" className="s-in" style={at(1.2)} />
      {[0, 1, 2, 3].map((index) => (
        <circle
          key={`in-${index}`}
          cx={222 + index * 10}
          cy={30}
          r="3"
          fill={C[2]}
          className="s-up"
          style={at(1.4 + index * 0.1)}
        />
      ))}
      {[0, 1].map((index) => (
        <circle
          key={`out-${index}`}
          cx={234 + index * 12}
          cy={118}
          r="4.5"
          fill={C[7]}
          className="s-pop"
          style={at(2 + index * 0.2)}
        />
      ))}

      {/* Analytics tile */}
      <g className="s-up" style={at(2.2)}>
        <rect x="292" y="34" width="118" height="54" rx="10" fill="#0d1430" stroke={C[2]} strokeOpacity="0.35" />
        {[0, 1, 2, 3, 4].map((index) => (
          <rect
            key={index}
            x={304 + index * 18}
            y={78 - (12 + index * 7)}
            width="10"
            height={12 + index * 7}
            rx="3"
            fill={index > 3 ? C[5] : C[2]}
            opacity={index > 3 ? 0.95 : 0.6}
            className="s-grow"
            style={at(2.35 + index * 0.14)}
          />
        ))}
      </g>

      {/* Reach ring */}
      <g transform="translate(350 146)">
        <circle r="30" fill="none" stroke="var(--vip-soft)" strokeOpacity="0.25" />
        {[0, 1, 2, 3, 4, 5].map((index) => {
          const angle = (index / 6) * Math.PI * 2;
          return (
            <circle
              key={index}
              cx={Math.cos(angle) * 30}
              cy={Math.sin(angle) * 30}
              r="3.6"
              fill={C[6]}
              className="s-light"
              style={at(2.6 + index * 0.14)}
            />
          );
        })}
        <circle r="6" fill={C[5]} className="s-pulse" style={at(2.6, 3.2)} />
      </g>
    </SceneFrame>
  );
}
