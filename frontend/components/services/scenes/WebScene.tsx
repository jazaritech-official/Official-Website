import { SceneFrame, at, C } from "./SceneFrame";

/**
 * WEB DEVELOPMENT — a browser window whose wireframe blocks fill with real
 * styling, whose viewport resizes desktop → tablet → mobile and whose
 * Lighthouse-style score ring fills to 98. Story: wireframe → style → responsive
 * → fast.
 */
export default function WebScene() {
  return (
    <SceneFrame className="sc-web">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Browser chrome */}
      <rect x="30" y="28" width="252" height="134" rx="12" fill="#0d1430" stroke={C[1]} strokeOpacity="0.4" />
      <path d="M 42 28 L 42 44 L 270 44" fill="none" stroke="var(--vip-soft)" strokeOpacity="0.2" />
      {[0, 1, 2].map((index) => (
        <circle key={index} cx={48 + index * 10} cy="36" r="3" fill={index === 1 ? C[5] : C[2]} opacity="0.8" />
      ))}

      {/* The layout being built */}
      <g className="s-up" style={at(0.3)}>
        <rect x="42" y="54" width="228" height="20" rx="5" fill={C[2]} opacity="0.28" className="s-grow-x" style={at(0.35)} />
      </g>
      <g className="s-up" style={at(0.7)}>
        <rect x="42" y="82" width="110" height="52" rx="6" fill={C[3]} opacity="0.3" />
        <rect x="160" y="82" width="110" height="52" rx="6" fill={C[2]} opacity="0.2" />
      </g>
      <g className="s-up" style={at(1.1)}>
        <rect x="42" y="142" width="70" height="12" rx="6" fill={C[7]} opacity="0.85" />
        <rect x="120" y="142" width="52" height="12" rx="6" fill="var(--vip-text)" opacity="0.25" />
      </g>

      {/* Responsive resize: the frame narrows twice */}
      <g className="s-slide" style={at(1.6, 5.4)}>
        <rect x="42" y="54" width="228" height="100" rx="8" fill="none" stroke={C[4]} strokeWidth="1" strokeDasharray="4 4" />
      </g>

      {/* Score ring */}
      <g transform="translate(348 96)">
        <circle r="34" fill="none" stroke="var(--vip-grid)" strokeWidth="7" />
        <circle
          r="34"
          fill="none"
          stroke={C[7]}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="214"
          strokeDashoffset="214"
          transform="rotate(-90)"
          className="s-draw"
          style={at(2.2, 5.4)}
        />
        <rect x="-16" y="-6" width="32" height="12" rx="3" fill={C[7]} opacity="0.9" className="s-pop" style={at(3)} />
      </g>

      {/* Metric chips */}
      {[0, 1, 2].map((index) => (
        <g key={index} className="s-up" style={at(2.6 + index * 0.2)}>
          <rect x={300 + index * 40} y="150" width="32" height="16" rx="6" fill="var(--vip-grid)" stroke={C[2]} strokeOpacity="0.4" />
        </g>
      ))}
    </SceneFrame>
  );
}
