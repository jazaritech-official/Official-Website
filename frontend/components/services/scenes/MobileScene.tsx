import { SceneFrame, at, C } from "./SceneFrame";

/**
 * MOBILE APP DEVELOPMENT — a phone frame with screens sliding horizontally, tap
 * ripples, a notification banner dropping in, a swipe cursor and an app-icon
 * grid popping. Story: onboard → navigate → notify → install.
 */
export default function MobileScene() {
  const screens = [
    { label: C[8], bars: 3 },
    { label: C[2], bars: 4 },
    { label: C[4], bars: 2 },
  ];
  return (
    <SceneFrame className="sc-mobile">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Phone */}
      <rect x="46" y="24" width="120" height="142" rx="18" fill="#0d1430" stroke={C[8]} strokeOpacity="0.5" strokeWidth="1.4" />
      <rect x="86" y="30" width="40" height="5" rx="2.5" fill="var(--vip-soft)" opacity="0.35" />

      <g clipPath="inset(0)" />
      {screens.map((screen, index) => (
        <g key={index} className="s-slide" style={at(0.3 + index * 0.9, 5.4)}>
          <rect x="56" y="42" width="100" height="112" rx="10" fill={screen.label} opacity={0.16 + index * 0.05} />
          <rect x="64" y="52" width="56" height="8" rx="4" fill={screen.label} opacity="0.85" />
          {Array.from({ length: screen.bars }, (_, bar) => (
            <rect key={bar} x="64" y={70 + bar * 18} width={84 - bar * 10} height="10" rx="4" fill="var(--vip-text)" opacity="0.16" />
          ))}
        </g>
      ))}

      {/* Tap ripple */}
      <g transform="translate(106 128)">
        <circle r="14" fill="none" stroke={C[2]} strokeWidth="1.2" className="s-pop" style={at(2.2, 5.4)} />
        <circle r="6" fill={C[2]} opacity="0.75" className="s-pulse" style={at(2.2, 2.6)} />
      </g>

      {/* Notification banner */}
      <g className="s-up" style={at(2.4)}>
        <rect x="184" y="34" width="150" height="30" rx="10" fill="#0d1430" stroke={C[4]} strokeOpacity="0.5" />
        <circle cx="200" cy="49" r="6" fill={C[4]} opacity="0.8" />
        <rect x="212" y="43" width="70" height="5" rx="2.5" fill={C[4]} opacity="0.85" />
        <rect x="212" y="53" width="46" height="5" rx="2.5" fill="var(--vip-text)" opacity="0.3" />
      </g>

      {/* Swipe cursor */}
      <g className="s-slide" style={at(3.1, 4.6)}>
        <path d="M 190 116 l 14 0 l -5 -5 M 204 116 l -5 5" fill="none" stroke={C[4]} strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* App-icon grid */}
      <g className="s-pop" style={at(3.3)}>
        {[0, 1, 2, 3].map((index) => (
          <rect
            key={index}
            x={196 + (index % 2) * 34}
            y={72 + Math.floor(index / 2) * 34}
            width="26"
            height="26"
            rx="8"
            fill={index % 3 === 0 ? C[4] : C[8]}
            opacity={0.75}
          />
        ))}
      </g>
      <g className="s-up" style={at(3.5)}>
        <rect x="288" y="86" width="58" height="6" rx="3" fill={C[2]} opacity="0.7" />
        <rect x="288" y="100" width="42" height="6" rx="3" fill="var(--vip-soft)" opacity="0.4" />
        <rect x="288" y="120" width="72" height="24" rx="9" fill={C[8]} opacity="0.75" />
      </g>
    </SceneFrame>
  );
}
