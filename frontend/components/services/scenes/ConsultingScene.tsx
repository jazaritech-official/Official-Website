import { SceneFrame, at, C } from "./SceneFrame";

/**
 * IT CONSULTING — a roadmap timeline with milestone pins dropping in, a
 * checklist ticking down, a compass settling, two speech bubbles exchanging and
 * a "Strategy → Delivery" arrow. Story: listen → plan → align → deliver.
 */
export default function ConsultingScene() {
  return (
    <SceneFrame className="sc-consulting">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Roadmap */}
      <line x1="40" y1="70" x2="250" y2="70" stroke="var(--vip-soft)" strokeOpacity="0.3" strokeWidth="1.4" />
      <line
        x1="40"
        y1="70"
        x2="250"
        y2="70"
        stroke={C[8]}
        strokeWidth="2"
        pathLength={1}
        className="s-draw"
        style={at(0.2, 5.4)}
      />
      {[0, 1, 2, 3].map((index) => (
        <g key={index} className="s-pop" style={at(0.5 + index * 0.34)}>
          <line x1={52 + index * 60} y1="70" x2={52 + index * 60} y2="56" stroke={C[8]} strokeOpacity="0.6" />
          <circle cx={52 + index * 60} cy="70" r="5" fill={C[8]} />
          <rect
            x={38 + index * 60}
            y="36"
            width="28"
            height="16"
            rx="5"
            fill="#0d1430"
            stroke={index === 3 ? C[7] : C[8]}
            strokeOpacity="0.5"
          />
        </g>
      ))}

      {/* Checklist ticking down */}
      <g className="s-up" style={at(1.9)}>
        <rect x="278" y="30" width="132" height="72" rx="10" fill="#0d1430" stroke={C[5]} strokeOpacity="0.35" />
      </g>
      {[0, 1, 2].map((index) => (
        <g key={`check-${index}`} className="s-tick" style={at(2.1 + index * 0.36, 5.4)}>
          <rect x="290" y={42 + index * 20} width="12" height="12" rx="3" fill="none" stroke={C[5]} strokeWidth="1.4" />
          <path
            d={`M 292 ${48 + index * 20} l 3 3 l 5 -7`}
            fill="none"
            stroke={C[7]}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <rect x="310" y={46 + index * 20} width={70 - index * 12} height="5" rx="2.5" fill="var(--vip-soft)" opacity="0.4" />
        </g>
      ))}

      {/* Compass settling */}
      <g transform="translate(122 130)">
        <circle r="24" fill="none" stroke={C[5]} strokeOpacity="0.5" strokeWidth="1.4" />
        <circle r="3" fill={C[5]} />
        <g className="s-slide" style={at(2.8, 5.4)}>
          <path d="M 0 -18 L 6 0 L 0 18 L -6 0 Z" fill={C[5]} opacity="0.9" />
        </g>
      </g>

      {/* Two bubbles exchanging */}
      <g className="s-up" style={at(2.2)}>
        <rect x="172" y="108" width="60" height="26" rx="12" fill={C[8]} opacity="0.22" stroke={C[8]} strokeOpacity="0.5" />
        <rect x="190" y="130" width="60" height="26" rx="12" fill={C[7]} opacity="0.18" stroke={C[7]} strokeOpacity="0.5" />
      </g>
      <g className="s-tick" style={at(3)}>
        <circle cx="182" cy="121" r="2.6" fill={C[8]} />
        <circle cx="234" cy="143" r="2.6" fill={C[7]} />
      </g>

      {/* Strategy → Delivery */}
      <g className="s-up" style={at(3.2)}>
        <rect x="278" y="118" width="44" height="6" rx="3" fill={C[8]} opacity="0.8" />
        <path d="M 322 111 l 12 10 l -12 10" fill="none" stroke={C[8]} strokeWidth="1.6" strokeLinecap="round" />
        <rect x="342" y="118" width="68" height="6" rx="3" fill={C[7]} opacity="0.8" />
      </g>
    </SceneFrame>
  );
}
