import { SceneFrame, at, C } from "./SceneFrame";

/**
 * SOFTWARE SOLUTIONS — "the making of software".
 * A code editor where coloured syntax lines type themselves in, a build bar
 * fills, UI components pop out of the code and snap into a mini app layout, a
 * commit graph grows at the side and a "Deployed" badge stamps in.
 * Story: type → build → assemble → ship → settle.
 */
export default function SoftwareScene() {
  const lines: Array<[number, string, number]> = [
    [10, C[2], 0],
    [10, C[3], 0.12],
    [10, C[2], 0.24],
    [10, C[1], 0.36],
  ];
  return (
    <SceneFrame className="sc-software">
      {/* Backdrop plane */}
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Editor window */}
      <rect x="26" y="28" width="228" height="132" rx="10" fill="#0d1430" stroke={C[1]} strokeOpacity="0.35" />
      <circle cx="40" cy="42" r="3" fill={C[4]} opacity="0.8" />
      <circle cx="52" cy="42" r="3" fill={C[5]} opacity="0.8" />
      <circle cx="64" cy="42" r="3" fill={C[7]} opacity="0.8" />

      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <g key={row}>
          <rect
            x="38"
            y={58 + row * 12}
            width="16"
            height="4"
            rx="2"
            fill={lines[row % lines.length][1]}
            opacity="0.55"
            className="s-type"
            style={at(0.15 + row * 0.16)}
          />
          <rect
            x={62 + (row % 3) * 8}
            y={58 + row * 12}
            width={72 - (row % 4) * 14}
            height="4"
            rx="2"
            fill={lines[(row + 2) % lines.length][1]}
            opacity="0.85"
            className="s-type"
            style={at(0.22 + row * 0.16)}
          />
        </g>
      ))}

      <rect x="38" y="146" width="196" height="5" rx="2.5" fill="var(--vip-grid)" />
      <rect x="38" y="146" width="196" height="5" rx="2.5" fill={C[2]} className="s-grow-x" style={at(1.5)} />

      {/* Commit graph */}
      <path
        d="M 268 150 L 268 108 L 288 88 L 288 52"
        fill="none"
        stroke={C[3]}
        strokeWidth="1.6"
        pathLength={1}
        className="s-draw"
        style={at(0.6)}
      />
      {[150, 108, 88, 52].map((y, index) => (
        <circle
          key={y}
          cx={index < 2 ? 268 : 288}
          cy={y}
          r="4"
          fill="#0d1430"
          stroke={C[3]}
          strokeWidth="1.6"
          className="s-light"
          style={at(0.7 + index * 0.24)}
        />
      ))}

      {/* Components snapping into a mini app */}
      <g className="s-pop" style={at(2.1)}>
        <rect x="308" y="34" width="104" height="24" rx="6" fill={C[1]} opacity="0.24" stroke={C[1]} />
      </g>
      <g className="s-pop" style={at(2.35)}>
        <rect x="308" y="66" width="48" height="42" rx="6" fill={C[2]} opacity="0.2" stroke={C[2]} />
        <rect x="364" y="66" width="48" height="42" rx="6" fill={C[2]} opacity="0.14" stroke={C[2]} />
      </g>
      <g className="s-pop" style={at(2.6)}>
        <rect x="308" y="118" width="72" height="14" rx="7" fill={C[3]} opacity="0.85" />
        <rect x="388" y="118" width="24" height="14" rx="7" fill={C[2]} opacity="0.5" />
      </g>

      {/* Deployed stamp */}
      <g className="s-stamp" style={at(3.1)}>
        <rect x="318" y="146" width="94" height="22" rx="11" fill="none" stroke={C[7]} strokeWidth="1.4" />
        <path d="M 330 157 l 5 5 l 9 -10" fill="none" stroke={C[7]} strokeWidth="1.8" strokeLinecap="round" />
        <rect x="350" y="154" width="50" height="6" rx="3" fill={C[7]} opacity="0.75" />
      </g>
    </SceneFrame>
  );
}
