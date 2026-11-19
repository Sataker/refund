// A QR-looking pattern for the /demo Pix (no payment exists there). Deterministic from the seed, three finder squares
// like a real QR, and a caption that says it cannot be paid.

const SIZE = 25;

function bits(seed: string): boolean[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out: boolean[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out.push((h & 1) === 1);
  }
  return out;
}

function inFinder(x: number, y: number): boolean {
  const corner = (cx: number, cy: number) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7;
  return corner(0, 0) || corner(SIZE - 7, 0) || corner(0, SIZE - 7);
}

export function FakeQr({ seed, className }: { seed: string; className?: string }) {
  const cells = bits(seed);
  const squares: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (!inFinder(x, y) && cells[y * SIZE + x]) squares.push({ x, y });
  return (
    <svg
      viewBox={`-2 -2 ${SIZE + 4} ${SIZE + 4}`}
      role="img"
      aria-label="QR Code simulado, não pode ser pago"
      className={className}
      data-testid="pix-qr"
      data-simulated="true"
      shapeRendering="crispEdges"
    >
      <rect x={-2} y={-2} width={SIZE + 4} height={SIZE + 4} fill="#fff" />
      {[
        [0, 0],
        [SIZE - 7, 0],
        [0, SIZE - 7],
      ].map(([fx = 0, fy = 0]) => (
        <g key={`${fx}-${fy}`}>
          <rect x={fx} y={fy} width={7} height={7} fill="#111" />
          <rect x={fx + 1} y={fy + 1} width={5} height={5} fill="#fff" />
          <rect x={fx + 2} y={fy + 2} width={3} height={3} fill="#111" />
        </g>
      ))}
      {squares.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#111" />
      ))}
    </svg>
  );
}
