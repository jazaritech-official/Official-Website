import { SceneFrame, at, C } from "./SceneFrame";

/**
 * E-COMMERCE — product cards slide in, one arcs into a cart, the cart badge
 * increments, a checkout bar fills, a payment card flips to a green tick and a
 * parcel closes and rides a conveyor away. Story: browse → add → pay → ship.
 */
export default function CommerceScene() {
  return (
    <SceneFrame className="sc-commerce">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Product cards */}
      {[0, 1, 2].map((index) => (
        <g key={index} className="s-up" style={at(0.2 + index * 0.22)}>
          <rect x={30 + index * 52} y="36" width="44" height="52" rx="8" fill="#0d1430" stroke={C[5]} strokeOpacity="0.4" />
          <rect x={38 + index * 52} y="46" width="28" height="22" rx="4" fill={C[5]} opacity={0.25 + index * 0.2} />
          <rect x={38 + index * 52} y="74" width="28" height="4" rx="2" fill="var(--vip-text)" opacity="0.4" />
        </g>
      ))}

      {/* One flies into the cart */}
      <g transform="translate(94 36)">
        <g className="s-arc" style={at(1.3, 6)}>
          <rect x="0" y="0" width="20" height="20" rx="5" fill={C[5]} opacity="0.9" />
        </g>
      </g>

      {/* Cart */}
      <g transform="translate(212 96)">
        <path d="M 0 0 L 10 0 L 16 30 L 52 30 L 58 8 L 14 8" fill="none" stroke={C[1]} strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="24" cy="38" r="4.5" fill={C[1]} />
        <circle cx="46" cy="38" r="4.5" fill={C[1]} />
      </g>
      <g className="s-pop" style={at(2.1)}>
        <circle cx="272" cy="92" r="11" fill={C[5]} />
        <circle cx="272" cy="92" r="6" fill="#0d1430" opacity="0.35" />
      </g>

      {/* Checkout bar + payment card */}
      <g className="s-up" style={at(2.3)}>
        <rect x="30" y="112" width="150" height="6" rx="3" fill="var(--vip-grid)" />
        <rect x="30" y="112" width="150" height="6" rx="3" fill={C[7]} className="s-grow-x" style={at(2.4)} />
        <rect x="30" y="130" width="74" height="26" rx="7" fill="#0d1430" stroke={C[2]} strokeOpacity="0.5" />
        <rect x="40" y="140" width="26" height="6" rx="3" fill={C[2]} opacity="0.8" />
      </g>
      <g className="s-tick" style={at(3.1)}>
        <circle cx="126" cy="143" r="9" fill="none" stroke={C[7]} strokeWidth="1.6" />
        <path d="M 121 143 l 3.5 3.5 l 6.5 -7" fill="none" stroke={C[7]} strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* Parcel on the conveyor */}
      <g className="s-carry" style={at(3.3, 5.4)}>
        <rect x="300" y="128" width="34" height="28" rx="4" fill={C[5]} opacity="0.85" />
        <line x1="300" y1="140" x2="334" y2="140" stroke="#0d1430" strokeOpacity="0.4" strokeWidth="2" />
      </g>
      <line x1="292" y1="158" x2="412" y2="158" stroke="var(--vip-soft)" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((index) => (
        <circle key={index} cx={300 + index * 26} cy="158" r="2.4" fill={C[2]} className="s-pulse" style={at(3.4 + index * 0.2, 2.6)} />
      ))}

      {/* Shelf backdrop */}
      <line x1="30" y1="100" x2="196" y2="100" stroke="var(--vip-soft)" strokeOpacity="0.18" strokeWidth="1" />
    </SceneFrame>
  );
}
