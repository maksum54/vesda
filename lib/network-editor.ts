export type Vec3 = { x: number; y: number; z: number };
export type Hole = {
  id: string;
  segment: number;
  fraction: number;
  diameter: number;
  flow: number;
};
export type Pipe = {
  id: number;
  enabled: boolean;
  vertices: Vec3[];
  holes: Hole[];
};
export type Detector = {
  id: string;
  name: string;
  model: string;
  position: Vec3;
  pipes: Pipe[];
};
export type Design = {
  version: 2;
  standard?: string;
  room: {
    name: string;
    width: number;
    length: number;
    height: number;
    target: number;
    altitude: number;
  };
  detectors: Detector[];
};
export const PIPE_COLORS = ['#0891b2', '#7c3aed', '#ea580c', '#16a34a'];
export const MODELS = [
  {
    id: 'vep4',
    name: 'VESDA-E VEP · 4 pipe',
    ports: 4,
    linear: 280,
    holes: 100,
    source:
      'https://xtralis.com/product/165/vesda-e-vep-aspirating-smoke-detector',
  },
  {
    id: 'vep1',
    name: 'VESDA-E VEP · 1 pipe',
    ports: 1,
    linear: 100,
    holes: 45,
    source:
      'https://xtralis.com/product/165/vesda-e-vep-aspirating-smoke-detector',
  },
  {
    id: 'veu4',
    name: 'VESDA-E VEU · 4 pipe',
    ports: 4,
    linear: 400,
    holes: 100,
    source: 'https://xtralis.com/file/10310',
  },
  {
    id: 'ves4',
    name: 'VESDA-E VES · 4 sector',
    ports: 4,
    linear: 280,
    holes: 100,
    source: 'https://xtralis.com/file/10310',
  },
] as const;
export const modelFor = (id: string) =>
  MODELS.find((m) => m.id === id) ?? MODELS[0];
export const uid = () => globalThis.crypto.randomUUID();
export const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
export const round = (n: number) => Math.round(n * 1000) / 1000;
export const pathFor = (d: Detector, p: Pipe): Vec3[] => [
  d.position,
  ...p.vertices,
];
export function lengthOf(path: Vec3[]) {
  return path.slice(1).reduce((sum, v, i) => sum + distance(path[i], v), 0);
}
export function holePosition(path: Vec3[], hole: Hole): Vec3 {
  const a = path[hole.segment] ?? path[0];
  const b = path[hole.segment + 1] ?? a;
  return {
    x: a.x + (b.x - a.x) * hole.fraction,
    y: a.y + (b.y - a.y) * hole.fraction,
    z: a.z + (b.z - a.z) * hole.fraction,
  };
}
export function nearestOnPath(path: Vec3[], p: { x: number; y: number }) {
  let best = { segment: 0, fraction: 0, distance: Infinity, point: path[0] };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1],
      dx = b.x - a.x,
      dy = b.y - a.y;
    if (dx * dx + dy * dy < 0.000001) continue;
    const fraction = clamp(
      ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy),
      0,
      1,
    );
    const point = holePosition(path, {
      id: '',
      segment: i,
      fraction,
      diameter: 3,
      flow: 2.7,
    });
    const dist = Math.hypot(point.x - p.x, point.y - p.y);
    if (dist < best.distance)
      best = { segment: i, fraction, distance: dist, point };
  }
  return best;
}
export function makeDetector(
  id: string,
  model: string,
  position: Vec3,
  name: string,
): Detector {
  return {
    id,
    model,
    position,
    name,
    pipes: Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      enabled: i === 0,
      vertices: [],
      holes: [],
    })),
  };
}
export const INITIAL_DESIGN: Design = {
  version: 2,
  room: {
    name: 'Ruang Data Utama',
    width: 30,
    length: 24,
    height: 4.5,
    target: 120,
    altitude: 8,
  },
  detectors: [
    {
      ...makeDetector('asd-01', 'vep4', { x: 3, y: 12, z: 1.5 }, 'ASD-01'),
      pipes: [
        {
          id: 1,
          enabled: true,
          vertices: [
            { x: 3, y: 12, z: 4 },
            { x: 3, y: 5, z: 4 },
            { x: 25, y: 5, z: 4 },
          ],
          holes: [6, 12, 18].map((x, i) => ({
            id: `sp-${i}`,
            segment: 2,
            fraction: x / 22,
            diameter: 3,
            flow: 2.7,
          })),
        },
        {
          id: 2,
          enabled: true,
          vertices: [
            { x: 3, y: 12, z: 4 },
            { x: 3, y: 19, z: 4 },
            { x: 25, y: 19, z: 4 },
          ],
          holes: [6, 12, 18].map((x, i) => ({
            id: `sp-${i + 3}`,
            segment: 2,
            fraction: x / 22,
            diameter: 3,
            flow: 2.7,
          })),
        },
        { id: 3, enabled: false, vertices: [], holes: [] },
        { id: 4, enabled: false, vertices: [], holes: [] },
      ],
    },
  ],
};
export function pipeStats(d: Detector, p: Pipe, room: Design['room']) {
  const length = p.enabled ? lengthOf(pathFor(d, p)) : 0;
  const flow = p.enabled ? p.holes.reduce((s, h) => s + h.flow, 0) : 0;
  const values = p.holes.map((h) => h.flow),
    max = Math.max(0, ...values),
    min = values.length ? Math.min(...values) : 0;
  return {
    length,
    flow,
    balance: max ? (min / max) * 100 : 0,
    transport: length
      ? (14 + length * 0.31 + p.holes.length * 0.72) *
        (1 + Math.max(0, room.altitude) / 18000)
      : 0,
  };
}
// Orthographic isometric projection: X, Y and Z have the same projected scale.
// Camera rotation is about world Z; editing inverses the projection at a chosen Z.
export function project(
  v: Vec3,
  room: Design['room'],
  iso: boolean,
  rotation: number,
) {
  const scale = iso
    ? Math.min(
        650 / ((room.width + room.length) * 0.866),
        300 / ((room.width + room.length) * 0.5 + room.height),
      )
    : Math.min(740 / room.width, 410 / room.length);
  const x = v.x - room.width / 2,
    y = v.y - room.length / 2;
  if (!iso) return { x: 480 + x * scale, y: 300 + y * scale };
  const a = (rotation * Math.PI) / 180,
    rx = x * Math.cos(a) - y * Math.sin(a),
    ry = x * Math.sin(a) + y * Math.cos(a);
  return {
    x: 480 + (rx - ry) * 0.866025403784 * scale,
    y: 320 + ((rx + ry) * 0.5 - v.z) * scale,
  };
}
export function unproject(
  p: { x: number; y: number },
  z: number,
  room: Design['room'],
  iso: boolean,
  rotation: number,
): Vec3 {
  const scale = iso
    ? Math.min(
        650 / ((room.width + room.length) * 0.866),
        300 / ((room.width + room.length) * 0.5 + room.height),
      )
    : Math.min(740 / room.width, 410 / room.length);
  if (!iso)
    return {
      x: (p.x - 480) / scale + room.width / 2,
      y: (p.y - 300) / scale + room.length / 2,
      z,
    };
  const diff = (p.x - 480) / (0.866025403784 * scale),
    sum = ((p.y - 320) / scale + z) * 2;
  const rx = (sum + diff) / 2,
    ry = (sum - diff) / 2,
    a = (rotation * Math.PI) / 180;
  return {
    x: rx * Math.cos(a) + ry * Math.sin(a) + room.width / 2,
    y: -rx * Math.sin(a) + ry * Math.cos(a) + room.length / 2,
    z,
  };
}
export function validDesign(value: unknown): value is Design {
  if (!value || typeof value !== 'object') return false;
  const d = value as Design,
    finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const v3 = (p: Vec3) => p && finite(p.x) && finite(p.y) && finite(p.z);
  return (
    d.version === 2 &&
    (d.standard === undefined || typeof d.standard === 'string') &&
    !!d.room &&
    typeof d.room.name === 'string' &&
    ['width', 'length', 'height', 'target'].every(
      (k) =>
        finite(d.room[k as keyof Design['room']]) &&
        Number(d.room[k as keyof Design['room']]) > 0,
    ) &&
    finite(d.room.altitude) &&
    Array.isArray(d.detectors) &&
    d.detectors.length > 0 &&
    d.detectors.length <= 64 &&
    d.detectors.every((x) => x && typeof x === 'object') &&
    new Set(d.detectors.map((x) => x.id)).size === d.detectors.length &&
    d.detectors.every(
      (x) =>
        typeof x.id === 'string' &&
        typeof x.name === 'string' &&
        MODELS.some((m) => m.id === x.model) &&
        v3(x.position) &&
        Array.isArray(x.pipes) &&
        x.pipes.length === 4 &&
        x.pipes.every(
          (p, i) =>
            !!p &&
            p.id === i + 1 &&
            typeof p.enabled === 'boolean' &&
            (!p.enabled || p.id <= modelFor(x.model).ports) &&
            Array.isArray(p.vertices) &&
            p.vertices.every(v3) &&
            Array.isArray(p.holes) &&
            p.holes.every(
              (h) =>
                !!h &&
                typeof h.id === 'string' &&
                Number.isInteger(h.segment) &&
                h.segment >= 0 &&
                h.segment < p.vertices.length &&
                finite(h.fraction) &&
                h.fraction >= 0 &&
                h.fraction <= 1 &&
                finite(h.diameter) &&
                h.diameter > 0 &&
                finite(h.flow) &&
                h.flow > 0,
            ),
        ),
    )
  );
}

export function nearestProjected(
  path: Vec3[],
  screen: { x: number; y: number },
  projectPoint: (v: Vec3) => { x: number; y: number },
) {
  const hit = nearestOnPath(
    path.map((v) => ({ ...projectPoint(v), z: 0 })),
    screen,
  );
  return {
    ...hit,
    point: holePosition(path, {
      id: '',
      segment: hit.segment,
      fraction: hit.fraction,
      diameter: 3,
      flow: 2.7,
    }),
  };
}

export function migrateLegacy(value: unknown): Design | null {
  if (!value || typeof value !== 'object') return null;
  const old = value as {
    room?: Record<string, unknown>;
    detector?: { x: number; y: number };
    points?: Array<{
      x: number;
      y: number;
      id: number;
      hole: number;
      flow: number;
    }>;
    selectedDetector?: number;
    pipesVisible?: boolean;
    standard?: string;
  };
  const models = ['veu4', 'vep4', 'ves4'];
  if (
    !old.room ||
    !old.detector ||
    !Array.isArray(old.points) ||
    !models[old.selectedDetector ?? 1]
  )
    return null;
  const room = {
    name: typeof old.room.name === 'string' ? old.room.name : 'Project',
    width: Number(old.room.width),
    length: Number(old.room.length),
    height: Number(old.room.height),
    target: Number(old.room.targetTransport ?? 120),
    altitude: Number(old.room.altitude ?? 0),
  };
  const pos = (p: { x: number; y: number }, z: number) => ({
    x: clamp(((p.x - 80) / 800) * room.width, 0, room.width),
    y: clamp(((p.y - 70) / 360) * room.length, 0, room.length),
    z,
  });
  const detector = makeDetector(
    'legacy-01',
    models[old.selectedDetector ?? 1],
    pos(
      { x: old.detector.x + 29, y: old.detector.y + 36 },
      Math.min(1.5, room.height),
    ),
    'ASD-01',
  );
  const points = [...old.points].sort((a, b) => a.id - b.id),
    z = Math.max(0, room.height - 0.5);
  detector.pipes[0] = {
    id: 1,
    enabled: old.pipesVisible !== false,
    vertices: [{ ...detector.position, z }, ...points.map((p) => pos(p, z))],
    holes: points.map((p, i) => ({
      id: `legacy-${p.id}`,
      segment: i + 1,
      fraction: 1,
      diameter: p.hole,
      flow: p.flow,
    })),
  };
  const design: Design = {
    version: 2,
    standard: old.standard,
    room,
    detectors: [detector],
  };
  return validDesign(design) ? design : null;
}
