export type SamplingPoint = {
  id: number;
  x: number;
  y: number;
  label: string;
  flow: number;
  hole: number;
};

export type DetectorPosition = { x: number; y: number };

export type RoomProfile = {
  name: string;
  width: number;
  length: number;
  height: number;
  altitude: number;
  targetTransport: number;
};

export type DetectorProfile = {
  model: string;
  family: string;
  ports: string;
  application: string;
};

export const detectorCatalog: DetectorProfile[] = [
  { model: 'VESDA-E VEU-A00', family: 'VESDA-E', ports: '4 pipe', application: 'Very early warning' },
  { model: 'VESDA-E VEP-A00', family: 'VESDA-E', ports: '4 pipe', application: 'Mainstream protection' },
  { model: 'VESDA-E VES-A00', family: 'VESDA-E', ports: '4 sector', application: 'Sector identification' },
  { model: 'VESDA-E VEA-040', family: 'VESDA-E', ports: '40 tubes', application: 'Addressable sampling' },
];

export const initialPoints: SamplingPoint[] = [
  { id: 1, x: 390, y: 165, label: 'SP-01', flow: 2.8, hole: 3.0 },
  { id: 2, x: 575, y: 165, label: 'SP-02', flow: 2.7, hole: 3.0 },
  { id: 3, x: 760, y: 165, label: 'SP-03', flow: 2.7, hole: 3.1 },
  { id: 4, x: 760, y: 335, label: 'SP-04', flow: 2.6, hole: 3.1 },
  { id: 5, x: 575, y: 335, label: 'SP-05', flow: 2.8, hole: 3.0 },
  { id: 6, x: 390, y: 335, label: 'SP-06', flow: 2.7, hole: 3.0 },
];

export const initialRoom: RoomProfile = {
  name: 'Ruang Data Utama',
  width: 30,
  length: 24,
  height: 4.5,
  altitude: 8,
  targetTransport: 120,
};

export function calculateNetwork(
  points: SamplingPoint[],
  detector: DetectorPosition,
  room: RoomProfile,
  pipesVisible: boolean,
) {
  const ordered = [...points].sort((a, b) => a.id - b.id);
  const segments = ordered.reduce(
    (total, point, index) => {
      const previous = index === 0 ? detector : ordered[index - 1];
      return total + Math.hypot(point.x - previous.x, point.y - previous.y);
    },
    0,
  );
  const meterPerUnit = room.width / 800;
  const pipeLength = pipesVisible ? segments * meterPerUnit : 0;
  const totalFlow = points.reduce((sum, point) => sum + point.flow, 0);
  const flows = points.map((point) => point.flow);
  const minFlow = flows.length ? Math.min(...flows) : 0;
  const maxFlow = flows.length ? Math.max(...flows) : 0;
  const balance = maxFlow ? (minFlow / maxFlow) * 100 : 0;
  const altitudeFactor = 1 + Math.max(0, room.altitude) / 18000;
  const transportTime = pipesVisible ? (14 + pipeLength * 0.31 + points.length * 0.72) * altitudeFactor : 0;
  const aggregateSensitivity = totalFlow ? 0.66 / totalFlow : 0;
  const compliant = pipesVisible && points.length > 0 && transportTime <= room.targetTransport && balance >= 85;

  return {
    pipeLength,
    totalFlow,
    minFlow,
    maxFlow,
    balance,
    transportTime,
    aggregateSensitivity,
    compliant,
  };
}
