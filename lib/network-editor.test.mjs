import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_DESIGN,
  project,
  unproject,
  pathFor,
  holePosition,
  lengthOf,
  pipeStats,
  nearestProjected,
  makeDetector,
  modelFor,
  validDesign,
  migrateLegacy,
} from './network-editor.ts';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('isometric and plan screen coordinates invert at all camera orientations and elevations', () => {
  for (const iso of [false, true])
    for (const angle of [0, 90, 180, 270])
      for (const point of [
        { x: 0, y: 0, z: 0 },
        { x: 12, y: 7, z: 2.5 },
        { x: 30, y: 24, z: 4.5 },
      ]) {
        const restored = unproject(
          project(point, INITIAL_DESIGN.room, iso, angle),
          point.z,
          INITIAL_DESIGN.room,
          iso,
          angle,
        );
        near(restored.x, point.x);
        near(restored.y, point.y);
        near(restored.z, point.z);
      }
});
test('isometric projection uses equal scale on all three axes', () => {
  const p = (v) => project(v, INITIAL_DESIGN.room, true, 0),
    origin = p({ x: 0, y: 0, z: 0 });
  const lengths = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ].map((v) => {
    const q = p(v);
    return Math.hypot(q.x - origin.x, q.y - origin.y);
  });
  near(lengths[0], lengths[1]);
  near(lengths[1], lengths[2]);
});
test('length follows hand drawn bends and vertical risers rather than joining holes', () => {
  near(
    lengthOf([
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 3 },
      { x: 4, y: 0, z: 3 },
      { x: 4, y: 5, z: 3 },
    ]),
    12,
  );
});
test('moving detector changes only the inlet segment, not sketched bends or downstream holes', () => {
  const d = structuredClone(INITIAL_DESIGN.detectors[0]),
    p = d.pipes[0],
    before = structuredClone(p.vertices),
    hole = holePosition(pathFor(d, p), p.holes[0]);
  d.position = { x: 9, y: 12, z: 1 };
  assert.deepEqual(p.vertices, before);
  assert.deepEqual(pathFor(d, p)[0], d.position);
  assert.deepEqual(holePosition(pathFor(d, p), p.holes[0]), hole);
});
test('sampling point remains on its segment when a bend moves', () => {
  const d = structuredClone(INITIAL_DESIGN.detectors[0]),
    p = d.pipes[0];
  p.vertices[2].x = 29;
  const v = holePosition(pathFor(d, p), p.holes[0]);
  near(v.y, 5);
  near(v.z, 4);
  assert.ok(v.x > 9 && v.x < 29);
});
test('screen hit testing binds a sampling point to a raised vertical riser in isometric view', () => {
  const path = [
      { x: 2, y: 3, z: 0 },
      { x: 2, y: 3, z: 4 },
      { x: 20, y: 3, z: 4 },
    ],
    p = (v) => project(v, INITIAL_DESIGN.room, true, 90);
  const hit = nearestProjected(path, p({ x: 2, y: 3, z: 2 }), p);
  assert.equal(hit.segment, 0);
  near(hit.fraction, 0.5);
  near(hit.point.z, 2);
});
test('one pipe does not change other pipes or detectors', () => {
  const design = structuredClone(INITIAL_DESIGN),
    second = makeDetector('asd-02', 'vep1', { x: 10, y: 10, z: 1 }, 'ASD-02');
  design.detectors.push(second);
  const unaffected = structuredClone(design.detectors[0].pipes[1]);
  design.detectors[0].pipes[0].vertices.push({ x: 25, y: 15, z: 4 });
  assert.deepEqual(design.detectors[0].pipes[1], unaffected);
  assert.equal(second.pipes[0].vertices.length, 0);
});
test('disabled pipe is excluded from active length, flow and transport without deleting stored geometry', () => {
  const d = structuredClone(INITIAL_DESIGN.detectors[0]),
    p = d.pipes[0];
  p.enabled = false;
  const s = pipeStats(d, p, INITIAL_DESIGN.room);
  assert.equal(s.length, 0);
  assert.equal(s.flow, 0);
  assert.equal(s.transport, 0);
  assert.ok(p.vertices.length > 0);
});
test('catalog distinguishes one inlet from four inlets', () => {
  assert.equal(modelFor('vep1').ports, 1);
  for (const id of ['vep4', 'veu4', 'ves4'])
    assert.equal(modelFor(id).ports, 4);
});
test('autosave round trip preserves separate routes and sampling anchors', () => {
  const copy = JSON.parse(JSON.stringify(INITIAL_DESIGN));
  assert.ok(validDesign(copy));
  assert.deepEqual(copy, INITIAL_DESIGN);
});
test('invalid backups and unsupported active ports are rejected', () => {
  for (const value of [null, {}, [], { ...INITIAL_DESIGN, detectors: [null] }])
    assert.equal(validDesign(value), false);
  const copy = structuredClone(INITIAL_DESIGN);
  copy.detectors[0].model = 'vep1';
  assert.equal(validDesign(copy), false);
  copy.detectors[0].model = 'vep4';
  copy.detectors[0].pipes[0].holes[0].segment = 999;
  assert.equal(validDesign(copy), false);
});
test('legacy project migrates into meters with attached sampling points and preserves the original standard', () => {
  const old = {
    room: {
      name: 'Legacy',
      width: 30,
      length: 24,
      height: 4.5,
      targetTransport: 120,
      altitude: 8,
    },
    detector: { x: 154, y: 214 },
    selectedDetector: 1,
    pipesVisible: true,
    standard: 'NFPA 72:2022',
    points: [{ id: 1, x: 390, y: 165, hole: 3, flow: 2.7 }],
  };
  const migrated = migrateLegacy(old);
  assert.ok(migrated && validDesign(migrated));
  assert.equal(migrated.standard, old.standard);
  const d = migrated.detectors[0],
    p = d.pipes[0];
  near(holePosition(pathFor(d, p), p.holes[0]).x, ((390 - 80) / 800) * 30);
  assert.equal(migrateLegacy({ ...old, selectedDetector: 3 }), null);
});
