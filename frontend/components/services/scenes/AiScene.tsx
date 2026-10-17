import { SceneFrame, at, C } from "./SceneFrame";

/**
 * AI SOLUTIONS — a layered network: input nodes pulse, connections light layer
 * by layer, hidden nodes glow, an output node fires; a chat bubble types its
 * three dots and answers; a small "model" chip settles. Story: feed → infer →
 * answer → compute.
 */
export default function AiScene() {
  const layers = [
    { x: 70, ys: [52, 84, 116, 148] },
    { x: 150, ys: [66, 98, 130] },
    { x: 226, ys: [78, 112] },
    { x: 292, ys: [95] },
  ];
  return (
    <SceneFrame className="sc-ai">
      <rect x="14" y="16" width="412" height="158" rx="12" fill="var(--vip-grid)" className="s-drift" />

      {/* Connections light layer by layer */}
      {layers.slice(0, -1).flatMap((layer, li) =>
        layer.ys.flatMap((y, yi) =>
          layers[li + 1].ys.map((y2, y2i) => (
            <line
              key={`${li}-${yi}-${y2i}`}
              x1={layer.x}
              y1={y}
              x2={layers[li + 1].x}
              y2={y2}
              stroke={C[3]}
              strokeWidth="1"
              pathLength={1}
              className="s-draw"
              opacity="0.5"
              style={at(0.2 + li * 0.5)}
            />
          )),
        ),
      )}

      {layers.map((layer, li) =>
        layer.ys.map((y, yi) => (
          <g key={`${li}-${y}`} className="s-light" style={at(0.3 + li * 0.5 + yi * 0.1)}>
            <circle cx={layer.x} cy={y} r="6.5" fill="#0d1430" stroke={C[2]} strokeWidth="1.6" />
            <circle cx={layer.x} cy={y} r="2.6" fill={C[2]} className="s-pulse" style={at(2.4 + li * 0.3 + yi * 0.16, 3.4)} />
          </g>
        )),
      )}

      {/* Output fires */}
      <g className="s-pop" style={at(2.4)}>
        <circle cx="292" cy="95" r="11" fill={C[3]} opacity="0.3" />
        <circle cx="292" cy="95" r="5" fill={C[7]} />
      </g>
      <path
        d="M 292 95 L 318 95"
        stroke={C[7]}
        strokeWidth="1.6"
        pathLength={1}
        className="s-draw"
        style={at(2.6, 5.4)}
      />

      {/* Chat bubble: three dots then a response line */}
      <g className="s-up" style={at(2.8)}>
        <rect x="330" y="52" width="80" height="34" rx="12" fill="#0d1430" stroke={C[3]} strokeOpacity="0.45" />
        {[0, 1, 2].map((index) => (
          <circle key={index} cx={348 + index * 12} cy="69" r="3" fill={C[3]} className="s-pulse" style={at(2.9 + index * 0.16, 2.4)} />
        ))}
      </g>
      <g className="s-up" style={at(3.3)}>
        <rect x="330" y="96" width="80" height="34" rx="12" fill={C[1]} opacity="0.28" stroke={C[2]} strokeOpacity="0.5" />
        <rect x="342" y="106" width="46" height="5" rx="2.5" fill={C[2]} opacity="0.9" />
        <rect x="342" y="117" width="30" height="5" rx="2.5" fill="var(--vip-text)" opacity="0.35" />
      </g>

      {/* Model chip */}
      <g className="s-pop" style={at(3.5)}>
        <rect x="330" y="142" width="80" height="24" rx="8" fill="#0d1430" stroke={C[7]} strokeOpacity="0.5" />
        <path d="M 344 154 l 4 -8 l 4 8 l 4 -8 l 4 8" fill="none" stroke={C[7]} strokeWidth="1.6" strokeLinejoin="round" />
        <rect x="366" y="151" width="34" height="6" rx="3" fill={C[7]} opacity="0.7" />
      </g>
    </SceneFrame>
  );
}
