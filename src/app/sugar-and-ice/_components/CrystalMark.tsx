type CrystalMarkProps = {
  size?: number;
  ink?: string;
  strokeRatio?: number;
};

export function CrystalMark({
  size = 64,
  ink = 'currentColor',
  strokeRatio = 0.1,
}: CrystalMarkProps) {
  const c = size / 2;
  const r = size * 0.46;
  const r2 = size * 0.22;
  const sw = size * strokeRatio;
  const diag = r2 * 0.707;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label="Sugar + Ice mark"
    >
      <g stroke={ink} strokeWidth={sw} strokeLinecap="round">
        <line x1={c} y1={c - r} x2={c} y2={c + r} />
        <line x1={c - r} y1={c} x2={c + r} y2={c} />
        <line x1={c - diag} y1={c - diag} x2={c + diag} y2={c + diag} />
        <line x1={c - diag} y1={c + diag} x2={c + diag} y2={c - diag} />
      </g>
      <circle cx={c} cy={c} r={size * 0.055} fill={ink} />
    </svg>
  );
}
