'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as PE,
  type ReactNode,
} from 'react';
import {
  Box,
  CircleDot,
  Download,
  Grid2X2,
  Hand,
  Languages,
  Layers,
  Moon,
  MousePointer2,
  Network,
  Plus,
  Redo2,
  RotateCcw,
  Route,
  Sun,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  INITIAL_DESIGN,
  MODELS,
  PIPE_COLORS,
  clamp,
  holePosition,
  modelFor,
  nearestProjected,
  migrateLegacy,
  pathFor,
  movePolylineNode,
  preserveTeeAngles,
  routesFor,
  pipeHoleCount,
  resizeRoom,
  parseNumeric,
  recommendHoles,
  distributeHoles,
  lengthOf,
  type Attachment,
  pipeStats,
  project,
  round,
  uid,
  unproject,
  validDesign,
  type Design,
  type Detector,
  type Pipe,
  type Vec3,
} from '@/lib/network-editor';

type Selection =
  | { kind: 'detector' }
  | { kind: 'vertex'; index: number }
  | { kind: 'hole'; id: string }
  | null;
type Gesture =
  | { kind: 'pan'; x: number; y: number; pan: { x: number; y: number } }
  | { kind: 'detector'; id: string; offset: Vec3; z: number }
  | { kind: 'vertex'; index: number; z: number }
  | { kind: 'hole'; id: string; z: number };
const STORAGE = 'asd-designer-v2';

export default function EngineeringWorkspace() {
  const [design, setDesign] = useState<Design>(INITIAL_DESIGN);
  const [loaded, setLoaded] = useState(false),
    [saved, setSaved] = useState(true);
  const [dark, setDark] = useState(false),
    [lang, setLang] = useState<'ID' | 'EN'>('ID');
  const [view, setView] = useState('iso'),
    [rotation, setRotation] = useState(290),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState('select'),
    [activeId, setActiveId] = useState('asd-01'),
    [pipeId, setPipeId] = useState(1);
  const [selection, setSelection] = useState<Selection>(null),
    [draft, setDraft] = useState<Vec3[] | null>(null),
    [cursor, setCursor] = useState<Vec3 | null>(null);
  const [history, setHistory] = useState<Design[]>([]),
    [future, setFuture] = useState<Design[]>([]);
  const [branchId, setBranchId] = useState('main');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const spacing = design.samplingSpacing ?? 6;
  const setSpacing = (value: number) => {
    checkpoint();
    setDesign((d) => ({ ...d, samplingSpacing: value }));
  };
  const [countOverride, setCountOverride] = useState<number | null>(null);
  const [samplingSegments, setSamplingSegments] = useState<number[] | null>(
    null,
  );
  const [coverage, setCoverage] = useState(true);
  const [snap, setSnap] = useState(true),
    [ortho, setOrtho] = useState(true),
    [height, setHeight] = useState(4);
  const [message, setMessage] = useState(''),
    [dialog, setDialog] = useState<'room' | 'delete' | 'compare' | null>(null);
  const [floor, setFloor] = useState<string | null>(null),
    [floorName, setFloorName] = useState('');
  const standard = design.standard ?? 'NFPA 72:2025';
  const setStandard = (value: string) => {
    checkpoint();
    setDesign((d) => ({ ...d, standard: value }));
  };
  const svg = useRef<SVGSVGElement>(null),
    world = useRef<SVGGElement>(null),
    gesture = useRef<Gesture | null>(null);
  const upload = useRef<HTMLInputElement>(null),
    restore = useRef<HTMLInputElement>(null);
  const t = (id: string, en: string) => (lang === 'ID' ? id : en);
  const active =
    design.detectors.find((d) => d.id === activeId) ?? design.detectors[0];
  const physicalPipe = active.pipes[pipeId - 1];
  const branch = physicalPipe.branches?.find((b) => b.id === branchId);
  const routeId = branch?.id ?? 'main',
    routeName = branch?.name ?? 'A';
  const pipe: Pipe = branch
    ? { ...physicalPipe, vertices: branch.vertices, holes: branch.holes }
    : physicalPipe;
  const model = modelFor(active.model),
    iso = view === 'iso',
    room = design.room;
  const catalogLengthLimit = active.pipes.some(
    (p) => p.enabled && p.branches?.length,
  )
    ? model.branched
    : model.linear;
  const path = pathFor(active, physicalPipe, routeId),
    stats = pipeStats(active, physicalPipe, room);
  const totalLength = design.detectors.reduce(
    (sum, d) =>
      sum + d.pipes.reduce((n, p) => n + pipeStats(d, p, room).length, 0),
    0,
  );
  const totalHoles = design.detectors.reduce(
    (sum, d) =>
      sum +
      d.pipes
        .filter((p) => p.enabled)
        .reduce((n, p) => n + pipeHoleCount(p), 0),
    0,
  );
  const enabledPipes = design.detectors.reduce(
    (sum, d) => sum + d.pipes.filter((p) => p.enabled).length,
    0,
  );
  const currentVertex =
    selection?.kind === 'vertex' ? pipe.vertices[selection.index] : undefined;
  const currentHole =
    selection?.kind === 'hole'
      ? pipe.holes.find((h) => h.id === selection.id)
      : undefined;
  const pp = (v: Vec3) => project(v, room, iso, rotation);
  const svgPath = (vertices: Vec3[]) =>
    vertices
      .map((v, i) => {
        const p = pp(v);
        return `${i ? 'L' : 'M'} ${p.x} ${p.y}`;
      })
      .join(' ');

  const segmentOptions = path
    .slice(1)
    .map((v, i) => ({
      index: i,
      length: Math.hypot(v.x - path[i].x, v.y - path[i].y),
    }))
    .filter((s) => s.length > 0.01);
  const selectedSegments = (
    samplingSegments ?? [
      segmentOptions.reduce((best, s) => (s.length > best.length ? s : best), {
        index: -1,
        length: 0,
      }).index,
    ]
  ).filter((i) => segmentOptions.some((s) => s.index === i));
  const recommended = selectedSegments.length
    ? recommendHoles(path, selectedSegments, spacing)
    : 0;
  const sampleCount = countOverride ?? recommended;
  const startPoint = attachment
    ? holePosition(pathFor(active, physicalPipe, attachment.parentId), {
        ...attachment,
        id: '',
        diameter: 0,
        flow: 0,
      })
    : (pipe.vertices.at(-1) ?? path[0]);
  const sketchLast = draft?.at(-1) ?? startPoint;
  function selectRoute(id: string) {
    setBranchId(id);
    setDraft(null);
    setAttachment(null);
    setCursor(null);
    setSelection(null);
    setSamplingSegments(null);
    setCountOverride(null);
  }
  function applySampling() {
    if (!selectedSegments.length || sampleCount < selectedSegments.length)
      return;
    checkpoint();
    const holes = distributeHoles(
      path,
      selectedSegments,
      Math.min(200, Math.round(sampleCount)),
    );
    updatePipe((p) => ({
      ...p,
      holes: [
        ...p.holes.filter((h) => !selectedSegments.includes(h.segment)),
        ...holes,
      ],
    }));
  }
  function checkpoint() {
    setHistory((h) => [...h.slice(-39), structuredClone(design)]);
    setFuture([]);
  }
  function updateDetector(fn: (d: Detector) => Detector, id = active.id) {
    setDesign((d) => ({
      ...d,
      detectors: d.detectors.map((x) => (x.id === id ? fn(x) : x)),
    }));
  }
  function updatePhysical(fn: (p: Pipe) => Pipe) {
    updateDetector((d) => ({
      ...d,
      pipes: d.pipes.map((p) =>
        p.id === pipeId ? (ortho ? preserveTeeAngles(d, p, fn(p)) : fn(p)) : p,
      ),
    }));
  }
  function updatePipe(fn: (p: Pipe) => Pipe) {
    updatePhysical((p) => {
      const b = p.branches?.find((b) => b.id === routeId);
      if (!b) return fn(p);
      const next = fn({ ...p, vertices: b.vertices, holes: b.holes });
      return {
        ...p,
        enabled: next.enabled,
        branches: p.branches?.map((x) =>
          x.id === routeId
            ? { ...x, vertices: next.vertices, holes: next.holes }
            : x,
        ),
      };
    });
  }
  function chooseDetector(id: string) {
    setActiveId(id);
    setPipeId(1);
    selectRoute('main');
    setSelection({ kind: 'detector' });
    setDraft(null);
    setCursor(null);
  }
  function chooseTool(next: string) {
    setTool(next);
    setAttachment(null);
    setDraft(null);
    setCursor(null);
    gesture.current = null;
    svg.current?.focus();
  }
  function undo() {
    setAttachment(null);
    if (draft) {
      setDraft(null);
      return;
    }
    if (!history.length) return;
    setFuture((f) => [design, ...f]);
    setDesign(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setSelection(null);
  }
  function redo() {
    setAttachment(null);
    if (!future.length) return;
    setHistory((h) => [...h, design]);
    setDesign(future[0]);
    setFuture((f) => f.slice(1));
    setSelection(null);
    setDraft(null);
  }
  function finish() {
    if (!draft?.length) return;
    checkpoint();
    if (attachment) {
      const id = uid(),
        name = Array.from({ length: 101 }, (_, i) =>
          i < 25 ? String.fromCharCode(66 + i) : `B${i + 1}`,
        ).find((n) => !physicalPipe.branches?.some((b) => b.name === n))!;
      updatePhysical((p) => ({
        ...p,
        branches: [
          ...(p.branches ?? []),
          { id, name, ...attachment, vertices: draft, holes: [] },
        ],
      }));
      setBranchId(id);
      setSamplingSegments(null);
      setCountOverride(null);
    } else
      updatePipe((p) => ({
        ...p,
        enabled: true,
        vertices: [...p.vertices, ...draft],
      }));
    setAttachment(null);
    setDraft(null);
    setCursor(null);
    setTool('select');
    setMessage(
      t(
        'Rute tersimpan. Geser node untuk mengubah belokan.',
        'Route saved. Drag nodes to adjust bends.',
      ),
    );
  }
  function pointAt(clientX: number, clientY: number, z: number): Vec3 {
    const matrix = world.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0, z };
    const screen = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    const v = unproject(screen, z, room, iso, rotation),
      step = snap ? 0.25 : 0.001;
    return {
      x: round(clamp(Math.round(v.x / step) * step, 0, room.width)),
      y: round(clamp(Math.round(v.y / step) * step, 0, room.length)),
      z,
    };
  }
  function sketchPoint(p: Vec3): Vec3 {
    const last = sketchLast;
    if (!ortho) return p;
    return Math.abs(p.x - last.x) >= Math.abs(p.y - last.y)
      ? { ...p, y: last.y }
      : { ...p, x: last.x };
  }
  function placeDetector(v: Vec3) {
    checkpoint();
    updateDetector((d) => ({ ...d, position: { ...v, z: d.position.z } }));
    chooseTool('select');
  }
  function startTee(clientX: number, clientY: number) {
    if ((physicalPipe.branches?.length ?? 0) >= 100) {
      setMessage(
        t('Maksimum 100 cabang per pipe.', 'Maximum 100 branches per pipe.'),
      );
      return;
    }
    if (!physicalPipe.enabled) {
      setMessage(
        t(
          'Aktifkan pipe sebelum membuat tee.',
          'Enable the pipe before adding a tee.',
        ),
      );
      return;
    }
    const matrix = world.current?.getScreenCTM();
    if (!matrix) return;
    const screen = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    const hits = routesFor(active, physicalPipe)
      .map((r) => ({ ...nearestProjected(r.path, screen, pp), route: r }))
      .sort((a, b) => a.distance - b.distance);
    const hit = hits[0];
    if (!hit || hit.distance > 18 / zoom) {
      setMessage(
        t('Klik pipa untuk lokasi tee.', 'Click a pipe for the tee location.'),
      );
      return;
    }
    setAttachment({
      parentId: hit.route.key,
      segment: hit.segment,
      fraction: hit.fraction,
    });
    setHeight(hit.point.z);
    setDraft([]);
    setTool('pipe');
    setCursor(null);
    setMessage(
      t(
        'Tee dipilih. Sketsa cabang lalu Enter.',
        'Tee selected. Sketch the branch then Enter.',
      ),
    );
  }
  function projectedHit(clientX: number, clientY: number) {
    const matrix = world.current?.getScreenCTM();
    const screen = matrix
      ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
      : { x: Infinity, y: Infinity };
    return nearestProjected(path, screen, pp);
  }
  function addHole(clientX: number, clientY: number) {
    if (!pipe.enabled || !pipe.vertices.length) {
      setMessage(
        t(
          'Gambar rute pipa aktif terlebih dahulu.',
          'Draw the active pipe route first.',
        ),
      );
      return;
    }
    const hit = projectedHit(clientX, clientY);
    if (!Number.isFinite(hit.distance) || hit.distance > 16 / zoom) {
      setMessage(
        t('Klik dekat garis pipa aktif.', 'Click near the active pipe line.'),
      );
      return;
    }
    checkpoint();
    const id = uid();
    updatePipe((p) => ({
      ...p,
      holes: [
        ...p.holes,
        {
          id,
          segment: hit.segment,
          fraction: hit.fraction,
          diameter: 3,
          flow: 2.7,
        },
      ],
    }));
    setSelection({ kind: 'hole', id });
  }
  function canvasDown(e: PE<SVGSVGElement>) {
    e.currentTarget.focus();
    if (e.button !== 0 && e.button !== 1) return;
    if (tool === 'pan' || e.button === 1) {
      const m = svg.current?.getScreenCTM();
      if (!m) return;
      const s = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      gesture.current = { kind: 'pan', x: s.x, y: s.y, pan };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const v = pointAt(e.clientX, e.clientY, height);
    if (tool === 'detector')
      placeDetector(pointAt(e.clientX, e.clientY, active.position.z));
    else if (tool === 'tee') startTee(e.clientX, e.clientY);
    else if (tool === 'sample') addHole(e.clientX, e.clientY);
    else if (tool === 'pipe') {
      if (!pipe.enabled) {
        setMessage(
          t('Aktifkan pipe ini terlebih dahulu.', 'Enable this pipe first.'),
        );
        return;
      }
      const next = sketchPoint(v),
        last = sketchLast;
      const vertical =
        Math.abs(last.z - next.z) > 0.001 ? { ...last, z: next.z } : null;
      const additions = [
        ...(vertical ? [vertical] : []),
        ...(Math.hypot(last.x - next.x, last.y - next.y) > 0.001 ? [next] : []),
      ];
      if (additions.length) setDraft((a) => [...(a ?? []), ...additions]);
    } else setSelection(null);
  }
  function move(e: PE<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) {
      if (tool === 'pipe')
        setCursor(sketchPoint(pointAt(e.clientX, e.clientY, height)));
      return;
    }
    if (g.kind === 'pan') {
      const m = svg.current?.getScreenCTM();
      if (!m) return;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
      setPan({ x: g.pan.x + p.x - g.x, y: g.pan.y + p.y - g.y });
      return;
    }
    const v = pointAt(e.clientX, e.clientY, g.z);
    if (g.kind === 'detector')
      updateDetector(
        (d) => ({
          ...d,
          position: {
            x: round(clamp(v.x - g.offset.x, 0, room.width)),
            y: round(clamp(v.y - g.offset.y, 0, room.length)),
            z: g.z,
          },
        }),
        g.id,
      );
    if (g.kind === 'vertex')
      updatePipe((p) => ({
        ...p,
        vertices: ortho
          ? movePolylineNode([path[0], ...p.vertices], g.index + 1, v).slice(1)
          : p.vertices.map((x, i) => (i === g.index ? v : x)),
      }));
    if (g.kind === 'hole') {
      const hit = projectedHit(e.clientX, e.clientY);
      if (Number.isFinite(hit.distance))
        updatePipe((p) => ({
          ...p,
          holes: p.holes.map((h) =>
            h.id === g.id
              ? { ...h, segment: hit.segment, fraction: hit.fraction }
              : h,
          ),
        }));
    }
  }
  function begin(e: PE<SVGGElement>, g: Gesture, s: Selection) {
    if (tool !== 'select') return;
    e.stopPropagation();
    checkpoint();
    gesture.current = g;
    setSelection(s);
    svg.current?.setPointerCapture(e.pointerId);
  }
  function removeSelection() {
    if (selection?.kind === 'hole') {
      checkpoint();
      updatePipe((p) => ({
        ...p,
        holes: p.holes.filter((h) => h.id !== selection.id),
      }));
      setSelection(null);
    } else if (selection?.kind === 'vertex') {
      setMessage(
        t(
          'Untuk mengganti rute, hapus pipe lalu sketsa ulang; undo tersedia.',
          'To replace the route, delete the pipe and sketch again; undo is available.',
        ),
      );
    } else setDialog('delete');
  }
  function deletePipe() {
    checkpoint();
    if (routeId === 'main')
      updatePhysical((p) => ({ ...p, vertices: [], holes: [], branches: [] }));
    else {
      const removed = new Set([routeId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const b of physicalPipe.branches ?? [])
          if (removed.has(b.parentId) && !removed.has(b.id)) {
            removed.add(b.id);
            changed = true;
          }
      }
      updatePhysical((p) => ({
        ...p,
        branches: p.branches?.filter((b) => !removed.has(b.id)),
      }));
    }
    selectRoute('main');
    setDialog(null);
    chooseTool('pipe');
  }
  function changeModel(id: string) {
    const capacity = modelFor(id).ports;
    if (
      active.pipes.some(
        (p) =>
          p.id > capacity &&
          (p.vertices.length || pipeHoleCount(p) || p.branches?.length),
      )
    ) {
      setMessage(
        t(
          'Pindahkan atau hapus rute Pipe 2–4 sebelum mengganti ke model 1-pipe.',
          'Move or delete Pipe 2–4 routes before switching to a 1-pipe model.',
        ),
      );
      return;
    }
    checkpoint();
    updateDetector((d) => ({
      ...d,
      model: id,
      pipes: d.pipes.map((p) =>
        p.id > capacity ? { ...p, enabled: false } : p,
      ),
    }));
    setPipeId(1);
  }
  function changeRoom(
    key: 'width' | 'length' | 'height' | 'target' | 'altitude',
    value: number,
  ) {
    selectRoute(routeId);
    checkpoint();
    if (key === 'width' || key === 'length' || key === 'height') {
      setDesign((d) => resizeRoom(d, key, value));
      if (key === 'height') setHeight((h) => Math.min(h, value));
      setMessage(
        t(
          'Ruangan diubah; jaringan mengikuti skala ruangan.',
          'Room changed; network scaled with the room.',
        ),
      );
    } else setDesign((d) => ({ ...d, room: { ...d.room, [key]: value } }));
  }
  useEffect(() => {
    // Restore after hydration; wait until restoration finishes before autosaving.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(STORAGE);
        const legacy = raw
          ? null
          : localStorage.getItem('asd-designer-autosave');
        if (raw || legacy) {
          const data: unknown = raw
            ? JSON.parse(raw)
            : migrateLegacy(JSON.parse(legacy!));
          if (validDesign(data)) {
            setDesign(data);
            setActiveId(data.detectors[0].id);
            setHeight(Math.min(4, data.room.height));
          }
        }
      } catch {
        setMessage('Autosave could not be restored.');
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        localStorage.setItem(STORAGE, JSON.stringify(design));
        setSaved(true);
      } catch {
        setSaved(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [design, loaded]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,button,a,[role="combobox"],[role="menuitem"],[role="switch"],[contenteditable="true"]',
        ) ||
        dialog
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'Enter' && draft) {
        e.preventDefault();
        finish();
      }
      if (e.key === 'Escape') {
        setDraft(null);
        setAttachment(null);
        setSelection(null);
        setTool('select');
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelection();
      }
      const shortcuts: Record<string, string> = {
        v: 'select',
        p: 'pipe',
        t: 'tee',
        s: 'sample',
        d: 'detector',
        h: 'pan',
      };
      if (shortcuts[e.key.toLowerCase()])
        chooseTool(shortcuts[e.key.toLowerCase()]);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  function download(content: Blob, filename: string) {
    const url = URL.createObjectURL(content),
      a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reportRows() {
    const output: Array<Array<string | number>> = [
      [
        'Detector',
        'Model',
        'Pipe',
        'Enabled',
        'Length (m)',
        'Sampling holes',
        'Assumed flow (L/min)',
        'Estimated transport (s)',
      ],
    ];
    for (const d of design.detectors)
      for (const p of d.pipes.filter((p) => p.id <= modelFor(d.model).ports)) {
        const s = pipeStats(d, p, room);
        output.push([
          d.name,
          modelFor(d.model).name,
          p.id,
          p.enabled ? 'Yes' : 'No',
          round(s.length),
          pipeHoleCount(p),
          round(s.flow),
          round(s.transport),
        ]);
      }
    return output;
  }
  function exportExcel() {
    const esc = (s: string | number) =>
      String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
    const sheet = (name: string, rs: Array<Array<string | number>>) =>
      `<Worksheet ss:Name="${name}"><Table>${rs.map((r) => `<Row>${r.map((v) => `<Cell><Data ss:Type="${typeof v === 'number' ? 'Number' : 'String'}">${esc(v)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`;
    const holes: Array<Array<string | number>> = [
      [
        'Detector',
        'Pipe',
        'Enabled',
        'Point',
        'X (m)',
        'Y (m)',
        'Z (m)',
        'Hole (mm)',
        'Assumed flow (L/min)',
      ],
    ];
    const vertices: Array<Array<string | number>> = [
      ['Detector', 'Pipe', 'Vertex', 'X (m)', 'Y (m)', 'Z (m)'],
    ];
    for (const d of design.detectors)
      for (const p of d.pipes)
        for (const r of routesFor(d, p)) {
          r.holes.forEach((h, i) => {
            const v = holePosition(r.path, h);
            holes.push([
              d.name,
              p.id,
              p.enabled ? 'Yes' : 'No',
              `${r.name}/SP-${i + 1}`,
              round(v.x),
              round(v.y),
              round(v.z),
              h.diameter,
              h.flow,
            ]);
          });
          r.path.forEach((v, i) => {
            if (r.vertices.length)
              vertices.push([
                d.name,
                p.id,
                `${r.name}/${i}`,
                round(v.x),
                round(v.y),
                round(v.z),
              ]);
          });
        }
    const bom: Array<Array<string | number>> = [
      ['Item', 'Quantity', 'Unit'],
      ...MODELS.map((m) => [
        m.name,
        design.detectors.filter((d) => d.model === m.id).length,
        'pcs',
      ]),
      ['Pipe Ø25 mm', round(totalLength), 'm'],
      ['Sampling holes', totalHoles, 'pcs'],
      [
        'Tee fittings',
        design.detectors.reduce(
          (n, d) =>
            n +
            d.pipes
              .filter((p) => p.enabled)
              .reduce((s, p) => s + (p.branches?.length ?? 0), 0),
          0,
        ),
        'pcs',
      ],
    ];
    const summary = [
      ['Project', room.name],
      ['Standard reference', standard],
      [
        'Method',
        'Length = sum of XYZ segment distances. Flow = sum of entered hole flow. Transport estimate = (14 + length × 0.31 + holes × 0.72) × (1 + altitude / 18000).',
      ],
      [
        'Limit',
        'Concept estimate; not an NFPA compliance or manufacturer hydraulic calculation.',
      ],
    ];
    download(
      new Blob(
        [
          `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheet('Summary', summary)}${sheet('Detectors and Pipes', reportRows())}${sheet('Sampling Points', holes)}${sheet('Route Coordinates', vertices)}${sheet('BOM', bom)}</Workbook>`,
        ],
        { type: 'application/vnd.ms-excel' },
      ),
      'asd-network.xml',
    );
  }
  async function exportPdf() {
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      let y = 20;
      const line = (text: string, size = 10) => {
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, 180) as string[];
        for (const item of lines) {
          if (y > 277) {
            doc.addPage();
            y = 18;
          }
          doc.text(item, 14, y);
          y += size * 0.48 + 2;
        }
      };
      line('ASD DESIGNER / NETWORK REPORT', 17);
      line(room.name);
      line(`${standard} | ${room.width} × ${room.length} × ${room.height} m`);
      line(
        `${design.detectors.length} detectors | ${enabledPipes} active pipes | ${totalLength.toFixed(2)} m | ${totalHoles} sampling holes`,
      );
      line(
        'Concept estimate. Flow is entered per hole; transport is an empirical estimate, not a manufacturer hydraulic calculation or NFPA approval.',
        9,
      );
      line(
        'Length = sum of XYZ segment distances. Transport (s) = (14 + length × 0.31 + holes × 0.72) × (1 + altitude / 18000).',
        9,
      );
      // Export the same world-space geometry in a compact isometric vector drawing.
      doc.addPage();
      y = 18;
      line('ISOMETRIC NETWORK', 14);
      const plot = (v: Vec3) => {
        const p = project(v, room, true, 290);
        return { x: p.x * 0.19 + 12, y: p.y * 0.19 + 35 };
      };
      const corners = [
        { x: 0, y: 0, z: 0 },
        { x: room.width, y: 0, z: 0 },
        { x: room.width, y: room.length, z: 0 },
        { x: 0, y: room.length, z: 0 },
        { x: 0, y: 0, z: 0 },
      ];
      doc.setDrawColor(170);
      corners.slice(1).forEach((v, i) => {
        const a = plot(corners[i]),
          b = plot(v);
        doc.line(a.x, a.y, b.x, b.y);
      });
      for (const d of design.detectors) {
        for (const p of d.pipes.filter((p) => p.enabled)) {
          doc.setDrawColor(PIPE_COLORS[p.id - 1]);
          for (const r of routesFor(d, p)) {
            const vs = r.path;
            vs.slice(1).forEach((v, i) => {
              const a = plot(vs[i]),
                b = plot(v);
              doc.line(a.x, a.y, b.x, b.y);
            });
            r.holes.forEach((h) => {
              const v = plot(holePosition(vs, h));
              doc.circle(v.x, v.y, 0.7);
            });
          }
        }
        const v = plot(d.position);
        doc.setTextColor(30);
        doc.setFontSize(8);
        doc.text(d.name, v.x, v.y + 4);
      }
      doc.addPage();
      y = 18;
      for (const d of design.detectors) {
        line(`${d.name} / ${modelFor(d.model).name}`, 13);
        line(
          `Position: X ${d.position.x} / Y ${d.position.y} / Z ${d.position.z} m`,
          9,
        );
        for (const p of d.pipes.filter((p) => p.enabled)) {
          const s = pipeStats(d, p, room);
          line(
            `Pipe ${p.id}: ${s.length.toFixed(2)} m / ${pipeHoleCount(p)} holes / ${s.flow.toFixed(2)} L/min / ~${s.transport.toFixed(1)} s`,
          );
          for (const r of routesFor(d, p))
            r.holes.forEach((h, i) => {
              const v = holePosition(r.path, h);
              line(
                `${r.name}/SP-${i + 1}  X ${v.x.toFixed(2)} Y ${v.y.toFixed(2)} Z ${v.z.toFixed(2)} m | hole ${h.diameter} mm | entered flow ${h.flow} L/min`,
                8,
              );
            });
        }
      }
      doc.save('asd-network-report.pdf');
    } catch {
      setMessage(
        t(
          'Ekspor PDF gagal. Silakan coba lagi.',
          'PDF export failed. Please try again.',
        ),
      );
    }
  }

  const bounds = [
    { x: 0, y: 0, z: 0 },
    { x: room.width, y: 0, z: 0 },
    { x: room.width, y: room.length, z: 0 },
    { x: 0, y: room.length, z: 0 },
  ];
  const toolbar: [string, ReactNode, string, string][] = [
    [
      'select',
      <MousePointer2 key="select" />,
      t('Pilih / geser', 'Select / move'),
      'V',
    ],
    ['pipe', <Route key="pipe" />, t('Sketsa pipa', 'Sketch pipe'), 'P'],
    ['tee', <Plus key="tee" />, t('Cabang tee', 'Tee branch'), 'T'],
    [
      'sample',
      <CircleDot key="sample" />,
      t('Titik sampling', 'Sampling point'),
      'S',
    ],
    ['detector', <Box key="detector" />, t('Pindahkan ASD', 'Move ASD'), 'D'],
    ['pan', <Hand key="pan" />, t('Geser tampilan', 'Pan view'), 'H'],
  ];
  return (
    <main
      className={`${dark ? 'dark ' : ''}ed-app bg-background text-foreground`}
    >
      <header className="ed-header bg-card border-b">
        <div className="ed-brand">
          <span className="ed-brand-icon">
            <Network size={21} />
          </span>
          <div>
            <strong>ASD Designer</strong>
            <small>{t('Studio jaringan pipa', 'Pipe network studio')}</small>
          </div>
        </div>
        <button className="ed-project" onClick={() => setDialog('room')}>
          <span>{room.name}</span>
          <small>
            {room.width} × {room.length} m · {standard}
          </small>
        </button>
        <div className="ed-header-actions">
          <span className={`ed-save ${saved ? '' : 'ed-warning'}`}>
            {loaded
              ? saved
                ? t('Tersimpan lokal', 'Saved locally')
                : t('Belum tersimpan', 'Not saved')
              : '…'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            title="Undo · Ctrl+Z"
            aria-label="Undo"
            disabled={!history.length && !draft}
            onClick={undo}
          >
            <Undo2 />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Redo · Ctrl+Shift+Z"
            aria-label="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === 'ID' ? 'EN' : 'ID')}
          >
            <Languages />
            {lang}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('Ganti tema', 'Toggle theme')}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" />}>
              <Download />
              {t('Ekspor', 'Export')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void exportPdf()}>
                PDF · {t('Gambar & kalkulasi', 'Drawing & calculations')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}>
                Excel · {t('Semua detector & pipa', 'All detectors & pipes')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  download(
                    new Blob([JSON.stringify(design, null, 2)], {
                      type: 'application/json',
                    }),
                    'asd-project.json',
                  )
                }
              >
                JSON · {t('Cadangan proyek', 'Project backup')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => restore.current?.click()}>
                {t('Buka cadangan JSON', 'Open JSON backup')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <input
        ref={restore}
        type="file"
        accept=".json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const d: unknown = JSON.parse(await f.text());
            if (!validDesign(d)) throw Error();
            checkpoint();
            setDesign(d);
            chooseDetector(d.detectors[0].id);
            setHeight(Math.min(4, d.room.height));
            setMessage(t('Proyek dipulihkan.', 'Project restored.'));
          } catch {
            setMessage(t('File proyek tidak valid.', 'Invalid project file.'));
          }
          e.target.value = '';
        }}
      />
      <div className="ed-layout">
        <aside className="ed-sidebar bg-card border-r">
          <div className="ed-section">
            <div className="ed-section-heading">
              <span>{t('Ruangan / ASD', 'Room / ASD')}</span>
              <Box size={16} />
            </div>
            <p className="ed-help">
              {t(
                'Satu ASD untuk ruangan ini. Pilih model dan geser posisinya pada denah.',
                'One ASD for this room. Select a model and drag its position.',
              )}
            </p>
            <ModelSelect value={active.model} onChange={changeModel} />
            <Button variant="outline" onClick={() => setDialog('room')}>
              {t('Ukuran ruangan', 'Room dimensions')} · {room.width} ×{' '}
              {room.length} m
            </Button>
          </div>
          <div className="ed-section">
            <div className="ed-section-heading">
              <span>
                Pipe {pipeId} · {t('Cabang', 'Branches')}
              </span>
            </div>
            {routesFor(active, physicalPipe).map((r) => (
              <button
                key={r.key}
                className={
                  r.key === routeId ? 'ed-branch is-active' : 'ed-branch'
                }
                onClick={() => selectRoute(r.key)}
              >
                <span>
                  <strong>
                    {t('Cabang', 'Branch')} {r.name}
                  </strong>
                  <small>
                    {lengthOf(r.path).toFixed(1)} m · {r.holes.length} SP
                  </small>
                </span>
                <Route size={16} />
              </button>
            ))}
            <Button
              variant="outline"
              disabled={!physicalPipe.vertices.length || !pipe.enabled}
              onClick={() => chooseTool('tee')}
            >
              <Plus />
              {t('Cabang tee', 'Tee branch')}
            </Button>
            <p className="ed-help">
              {t(
                'Pilih Cabang tee, klik titik pada pipa, lalu sketsa cabang baru.',
                'Choose Tee branch, click a point on the pipe, then sketch the new branch.',
              )}
            </p>
          </div>
          <div className="ed-section">
            <div className="ed-section-heading">
              <span>
                {t('Sampling cabang', 'Branch sampling')} {routeName}
              </span>
              <CircleDot size={16} />
            </div>
            <p className="ed-help">
              {t(
                'Pilih bagian pipa yang akan diberi sampling.',
                'Select pipe sections to receive sampling points.',
              )}
            </p>
            <div className="ed-segment-list">
              {segmentOptions.map((s) => (
                <label key={s.index}>
                  <input
                    type="checkbox"
                    checked={selectedSegments.includes(s.index)}
                    onChange={(e) => {
                      setSamplingSegments(
                        e.target.checked
                          ? [...selectedSegments, s.index]
                          : selectedSegments.filter((i) => i !== s.index),
                      );
                      setCountOverride(null);
                    }}
                  />{' '}
                  S{s.index + 1} · {s.length.toFixed(1)} m
                </label>
              ))}
            </div>
            <NumberField
              label={t(
                'Target jarak sampling (m)',
                'Target sample spacing (m)',
              )}
              value={spacing}
              min={0.5}
              max={20}
              onChange={(v) => {
                setSpacing(v);
                setCountOverride(null);
              }}
            />
            <div className="ed-recommendation">
              {t('Rekomendasi awal', 'Initial recommendation')}:{' '}
              <strong>
                {recommended} {t('titik', 'points')}
              </strong>
            </div>
            <NumberField
              label={t('Jumlah titik — dapat diubah', 'Point count — editable')}
              value={sampleCount}
              min={0}
              max={200}
              step={1}
              onChange={(v) => setCountOverride(Math.round(v))}
            />
            <Button
              disabled={
                !pipe.enabled ||
                !selectedSegments.length ||
                sampleCount < selectedSegments.length
              }
              onClick={applySampling}
            >
              {t('Terapkan ke bagian terpilih', 'Apply to selected sections')}
            </Button>
            <p className="ed-help">
              {t(
                'Mengganti titik pada bagian terpilih; Undo tersedia. Rekomendasi jarak adalah tata letak awal, bukan verifikasi cakupan NFPA.',
                'Replaces samples on selected sections; Undo is available. Spacing is a preliminary layout, not NFPA coverage verification.',
              )}
            </p>
          </div>
          <div className="ed-device-list">
            {design.detectors.map((d) => (
              <button
                key={d.id}
                className={`ed-device ${active.id === d.id ? 'is-active' : ''}`}
                onClick={() => chooseDetector(d.id)}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('asd/existing', d.id)
                }
              >
                <span className="ed-device-icon">
                  <Box size={18} />
                </span>
                <span>
                  <strong>{d.name}</strong>
                  <small>{modelFor(d.model).name}</small>
                  <small>
                    {d.position.x.toFixed(1)}, {d.position.y.toFixed(1)},{' '}
                    {d.position.z.toFixed(1)} m
                  </small>
                </span>
                <b>
                  {d.pipes.filter((p) => p.enabled).length}/
                  {modelFor(d.model).ports}
                </b>
              </button>
            ))}
          </div>
          <div className="ed-section ed-library">
            <div className="ed-section-heading">
              <span>{t('Katalog ASD', 'ASD catalog')}</span>
              <Layers size={15} />
            </div>
            <p className="ed-help">
              {t(
                'Pilih model untuk ruangan ini.',
                'Choose a model for this room.',
              )}
            </p>
            {MODELS.map((m) => (
              <div key={m.id} className="ed-catalog-item">
                <Box size={16} />
                <button onClick={() => changeModel(m.id)}>{m.name}</button>
                <a
                  href={m.source}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${m.name} datasheet`}
                >
                  ↗
                </a>
              </div>
            ))}
            <p className="ed-help">
              {t(
                'VEA: 40 tabung microbore, bukan sistem Pipe 1–4. Profilnya belum tersedia di editor ini.',
                'VEA: 40 microbore tubes, a different architecture from Pipe 1–4. Not available in this editor.',
              )}{' '}
              <a
                href="https://xtralis.com/file/10310"
                target="_blank"
                rel="noreferrer"
              >
                Xtralis ↗
              </a>
            </p>
          </div>
        </aside>
        <section className="ed-center">
          <div className="ed-topbar bg-card border-b">
            <Tabs
              value={view}
              onValueChange={(v) => {
                setView(String(v));
                setPan({ x: 0, y: 0 });
              }}
            >
              <TabsList>
                <TabsTrigger value="plan">
                  <Grid2X2 />
                  2D Plan
                </TabsTrigger>
                <TabsTrigger value="iso">
                  <Box />
                  3D Isometric
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={() => upload.current?.click()}
            >
              <Upload />
              {t('Denah', 'Floor plan')}
            </Button>
            <input
              hidden
              ref={upload}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!f.type.startsWith('image/') || f.size > 10 * 1024 * 1024) {
                  setMessage(
                    t(
                      'Pilih gambar denah maksimum 10 MB.',
                      'Choose a floor plan image up to 10 MB.',
                    ),
                  );
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === 'string') {
                    setFloor(reader.result);
                    setFloorName(f.name);
                    setView('plan');
                  }
                };
                reader.readAsDataURL(f);
              }}
            />
            <div className="ed-topbar-end">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => clamp(z * 0.8, 0.4, 3))}
              >
                <ZoomOut />
              </Button>
              <span>{Math.round(zoom * 100)}%</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => clamp(z * 1.25, 0.4, 3))}
              >
                <ZoomIn />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('Reset tampilan', 'Reset view')}
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                  setRotation(290);
                }}
              >
                <RotateCcw />
              </Button>
            </div>
          </div>
          <div className="ed-pipebar bg-card border-b">
            <strong>{active.name}</strong>
            <div className="ed-pipe-tabs">
              {[1, 2, 3, 4].map((id) => (
                <button
                  key={id}
                  disabled={id > model.ports}
                  className={pipeId === id ? 'is-active' : ''}
                  style={
                    {
                      '--pipe-color': PIPE_COLORS[id - 1],
                    } as React.CSSProperties
                  }
                  onClick={() => {
                    setPipeId(id);
                    selectRoute('main');
                    setSelection(null);
                    setDraft(null);
                    setCursor(null);
                  }}
                >
                  <i />
                  Pipe {id}
                  <small>
                    {id > model.ports
                      ? '—'
                      : active.pipes[id - 1].enabled
                        ? 'ON'
                        : 'OFF'}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <div
            className={`ed-canvas ${iso ? 'ed-scene-iso' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('asd/existing'),
                m = e.dataTransfer.getData('asd/model');
              if (id) {
                const d = design.detectors.find((x) => x.id === id);
                if (d) {
                  checkpoint();
                  const v = pointAt(e.clientX, e.clientY, d.position.z);
                  updateDetector((x) => ({ ...x, position: v }), id);
                  chooseDetector(id);
                }
              } else if (MODELS.some((x) => x.id === m)) changeModel(m);
            }}
          >
            <div className="ed-float-tools bg-card border">
              {toolbar.map(([id, icon, label, key]) => (
                <Button
                  key={id}
                  variant={tool === id ? 'default' : 'ghost'}
                  size="icon"
                  aria-label={label}
                  title={`${label} · ${key}`}
                  onClick={() => chooseTool(id)}
                >
                  {icon}
                </Button>
              ))}
            </div>
            <div className="ed-view-label">
              <span>{iso ? 'ISOMETRIC / XYZ' : 'TOP / XY'}</span>
              <small>
                {room.width} × {room.length} × {room.height} m
              </small>
            </div>
            {iso && (
              <div className="ed-camera bg-card border">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRotation((a) => (a + 90) % 360)}
                >
                  ↶ 90°
                </Button>
                <span>{rotation}°</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRotation((a) => (a + 270) % 360)}
                >
                  90° ↷
                </Button>
              </div>
            )}
            <svg
              ref={svg}
              role="application"
              tabIndex={-1}
              viewBox="0 0 960 600"
              className={`ed-drawing tool-${tool}`}
              aria-label={t(
                'Editor jaringan pipa ASD',
                'ASD pipe network editor',
              )}
              onPointerDown={canvasDown}
              onPointerMove={move}
              onPointerUp={(e) => {
                gesture.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                gesture.current = null;
              }}
              onWheel={(e) => {
                if (e.ctrlKey) return;
                setZoom((z) =>
                  clamp(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), 0.4, 3),
                );
              }}
            >
              <g
                ref={world}
                transform={`translate(${480 + pan.x} ${300 + pan.y}) scale(${zoom}) translate(-480 -300)`}
              >
                <path
                  d={svgPath([...bounds, bounds[0]])}
                  className="ed-floor"
                />
                {!iso && floor && (
                  <image
                    href={floor}
                    x={pp(bounds[0]).x}
                    y={pp(bounds[0]).y}
                    width={pp(bounds[1]).x - pp(bounds[0]).x}
                    height={pp(bounds[3]).y - pp(bounds[0]).y}
                    opacity=".3"
                    preserveAspectRatio="none"
                  />
                )}
                {Array.from(
                  { length: Math.min(100, Math.ceil(room.width / 2)) + 1 },
                  (_, i) =>
                    (i * room.width) / Math.min(100, Math.ceil(room.width / 2)),
                ).map((x) => (
                  <path
                    key={`x${x}`}
                    d={svgPath([
                      { x, y: 0, z: 0 },
                      { x, y: room.length, z: 0 },
                    ])}
                    className="ed-grid-line"
                  />
                ))}
                {Array.from(
                  { length: Math.min(100, Math.ceil(room.length / 2)) + 1 },
                  (_, i) =>
                    (i * room.length) /
                    Math.min(100, Math.ceil(room.length / 2)),
                ).map((y) => (
                  <path
                    key={`y${y}`}
                    d={svgPath([
                      { x: 0, y, z: 0 },
                      { x: room.width, y, z: 0 },
                    ])}
                    className="ed-grid-line"
                  />
                ))}
                {coverage &&
                  design.detectors.map((d) =>
                    d.pipes
                      .filter((p) => p.enabled)
                      .flatMap((p) =>
                        routesFor(d, p).flatMap((r) =>
                          r.holes.map((h) => {
                            const v = holePosition(r.path, h),
                              at = pp(v),
                              base = pp({ ...v, z: 0 });
                            const ring = Array.from({ length: 49 }, (_, i) => ({
                              x:
                                v.x +
                                (Math.cos((i * Math.PI) / 24) * spacing) / 2,
                              y:
                                v.y +
                                (Math.sin((i * Math.PI) / 24) * spacing) / 2,
                              z: 0,
                            }));
                            return (
                              <g key={h.id} className="ed-coverage">
                                <path d={svgPath(ring)} />
                                {iso && (
                                  <line
                                    x1={at.x}
                                    y1={at.y}
                                    x2={base.x}
                                    y2={base.y}
                                  />
                                )}
                              </g>
                            );
                          }),
                        ),
                      ),
                  )}
                {design.detectors.map((d) => (
                  <g key={d.id}>
                    {d.pipes
                      .filter((p) => p.enabled)
                      .flatMap((p) =>
                        routesFor(d, p)
                          .filter((r) => r.vertices.length)
                          .map((r) => ({
                            ...p,
                            vertices: r.vertices,
                            holes: r.holes,
                            route: r,
                          })),
                      )
                      .map((p) => {
                        const vertices = p.route.path,
                          focus =
                            d.id === active.id &&
                            p.id === pipeId &&
                            p.route.key === routeId;
                        return (
                          <g
                            key={`${p.id}-${p.route.key}`}
                            opacity={iso || focus ? 1 : 0.65}
                          >
                            {iso && (
                              <path
                                d={svgPath(
                                  vertices.map((v) => ({ ...v, z: 0 })),
                                )}
                                className="ed-pipe-shadow"
                              />
                            )}
                            <path
                              d={svgPath(vertices)}
                              stroke={iso ? '#c62828' : PIPE_COLORS[p.id - 1]}
                              className={`ed-route ${focus ? 'is-focus' : ''}`}
                              onPointerDown={(e) => {
                                if (tool === 'select') {
                                  e.stopPropagation();
                                  setActiveId(d.id);
                                  setPipeId(p.id);
                                  selectRoute(p.route.key);
                                  setSelection(null);
                                }
                              }}
                            />
                            {p.route.key !== 'main' && (
                              <circle
                                cx={pp(vertices[0]).x}
                                cy={pp(vertices[0]).y}
                                r={5}
                                className="ed-tee-dot"
                              />
                            )}
                            {focus &&
                              tool === 'select' &&
                              vertices.slice(1).map((v, i) => {
                                const a = vertices[i];
                                if (Math.hypot(v.x - a.x, v.y - a.y) < 0.01)
                                  return null;
                                const mid = pp({
                                  x: (v.x + a.x) / 2,
                                  y: (v.y + a.y) / 2,
                                  z: (v.z + a.z) / 2,
                                });
                                return (
                                  <text
                                    key={i}
                                    x={mid.x}
                                    y={mid.y + 18}
                                    className="ed-svg-label"
                                  >
                                    S{i + 1}
                                  </text>
                                );
                              })}
                            {vertices.length > 1 && (
                              <text
                                x={pp(vertices[vertices.length - 1]).x + 10}
                                y={pp(vertices[vertices.length - 1]).y + 5}
                                className="ed-svg-label"
                                fill={PIPE_COLORS[p.id - 1]}
                              >
                                Pipe {p.route.name} ·{' '}
                                {lengthOf(vertices).toFixed(1)} m
                              </text>
                            )}
                            {p.holes.map((h, i) => {
                              const v = holePosition(vertices, h),
                                a = pp(v);
                              return (
                                <g
                                  key={h.id}
                                  transform={`translate(${a.x} ${a.y})`}
                                  onPointerDown={(e) => {
                                    if (tool === 'select') {
                                      e.stopPropagation();
                                      setActiveId(d.id);
                                      setPipeId(p.id);
                                      selectRoute(p.route.key);
                                      begin(
                                        e,
                                        { kind: 'hole', id: h.id, z: v.z },
                                        { kind: 'hole', id: h.id },
                                      );
                                    }
                                  }}
                                >
                                  <circle
                                    r={
                                      focus &&
                                      selection?.kind === 'hole' &&
                                      selection.id === h.id
                                        ? 10
                                        : 6
                                    }
                                    className="ed-hole"
                                    stroke={PIPE_COLORS[p.id - 1]}
                                  />
                                  <text
                                    y="-13"
                                    textAnchor="middle"
                                    className="ed-svg-label"
                                  >
                                    SP-{i + 1}
                                  </text>
                                </g>
                              );
                            })}
                            {focus &&
                              tool === 'select' &&
                              p.vertices.map((v, i) => {
                                const a = pp(v);
                                return (
                                  <g
                                    key={i}
                                    transform={`translate(${a.x} ${a.y})`}
                                    onPointerDown={(e) =>
                                      begin(
                                        e,
                                        { kind: 'vertex', index: i, z: v.z },
                                        { kind: 'vertex', index: i },
                                      )
                                    }
                                  >
                                    <rect
                                      x="-5"
                                      y="-5"
                                      width="10"
                                      height="10"
                                      rx="2"
                                      className={`ed-node ${selection?.kind === 'vertex' && selection.index === i ? 'is-selected' : ''}`}
                                      stroke={PIPE_COLORS[p.id - 1]}
                                    />
                                  </g>
                                );
                              })}
                          </g>
                        );
                      })}
                  </g>
                ))}
                {design.detectors.map((d) => {
                  const p = pp(d.position),
                    base = pp({ ...d.position, z: 0 }),
                    focus = active.id === d.id;
                  return (
                    <g
                      key={d.id}
                      className="ed-detector"
                      onPointerDown={(e) => {
                        if (tool !== 'select') return;
                        const v = pointAt(e.clientX, e.clientY, d.position.z);
                        chooseDetector(d.id);
                        begin(
                          e,
                          {
                            kind: 'detector',
                            id: d.id,
                            z: d.position.z,
                            offset: {
                              x: v.x - d.position.x,
                              y: v.y - d.position.y,
                              z: 0,
                            },
                          },
                          { kind: 'detector' },
                        );
                      }}
                    >
                      {iso && (
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={base.x}
                          y2={base.y}
                          className="ed-drop-line"
                        />
                      )}
                      <g transform={`translate(${p.x} ${p.y})`}>
                        <rect
                          x="-19"
                          y="-15"
                          width="38"
                          height="32"
                          rx="5"
                          className={
                            focus
                              ? 'ed-detector-body is-selected'
                              : 'ed-detector-body'
                          }
                        />
                        {iso && (
                          <path
                            d="M-19 -15 L-11 -21 L27 -21 L19 -15 M19 -15 L27 -21 L27 11 L19 17"
                            className="ed-detector-side"
                          />
                        )}
                        <rect
                          x="-11"
                          y="-7"
                          width="22"
                          height="9"
                          rx="2"
                          fill="#0891b2"
                        />
                        <circle cx="-8" cy="9" r="2" fill="#22c55e" />
                        {Array.from(
                          { length: modelFor(d.model).ports },
                          (_, i) => (
                            <circle
                              key={i}
                              cx={-10 + i * 7}
                              cy="-15"
                              r="2"
                              fill={PIPE_COLORS[i]}
                            />
                          ),
                        )}
                        <text
                          y="34"
                          textAnchor="middle"
                          className="ed-svg-label ed-detector-name"
                        >
                          {d.name}
                        </text>
                      </g>
                    </g>
                  );
                })}
                {draft && (
                  <path
                    d={svgPath([startPoint, ...draft])}
                    className="ed-route ed-draft"
                    stroke={PIPE_COLORS[pipeId - 1]}
                  />
                )}
                {tool === 'pipe' && cursor && pipe.enabled && (
                  <path
                    d={svgPath([
                      sketchLast,
                      ...(Math.abs(sketchLast.z - cursor.z) > 0.001
                        ? [{ ...sketchLast, z: cursor.z }]
                        : []),
                      cursor,
                    ])}
                    className="ed-preview"
                    stroke={PIPE_COLORS[pipeId - 1]}
                  />
                )}
                <g className="ed-axes">
                  {[
                    { x: 4, y: 0, z: 0, label: 'X', color: '#ef4444' },
                    { x: 0, y: 4, z: 0, label: 'Y', color: '#22c55e' },
                    ...(iso
                      ? [{ x: 0, y: 0, z: 4, label: 'Z', color: '#3b82f6' }]
                      : []),
                  ].map((v) => {
                    const origin = pp({ x: 0, y: 0, z: 0 }),
                      end = pp(v);
                    return (
                      <g key={v.label}>
                        <line
                          x1={origin.x}
                          y1={origin.y}
                          x2={end.x}
                          y2={end.y}
                          stroke={v.color}
                        />
                        <text x={end.x + 5} y={end.y - 5} fill={v.color}>
                          {v.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </g>
            </svg>
            <div className="ed-canvas-bottom">
              <span className="ed-instruction bg-card border">
                {tool === 'pipe'
                  ? t(
                      'Klik untuk belokan · Enter selesai · Esc batal',
                      'Click bends · Enter finish · Esc cancel',
                    )
                  : tool === 'tee'
                    ? t(
                        'Klik garis pipa untuk lokasi tee.',
                        'Click the pipe line for the tee location.',
                      )
                    : tool === 'sample'
                      ? t(
                          'Klik pada rute pipa aktif untuk titik sampling',
                          'Click the active pipe route to add a sampling point',
                        )
                      : tool === 'detector'
                        ? t(
                            'Klik denah untuk memindahkan ASD',
                            'Click the drawing to move the ASD',
                          )
                        : t(
                            'Geser detector, node pipa, atau titik sampling',
                            'Drag detectors, pipe nodes, or sampling points',
                          )}
              </span>
              {draft && (
                <Button size="sm" onClick={finish}>
                  {t('Selesai', 'Finish')} ↵
                </Button>
              )}
            </div>
          </div>
          <div className="ed-options bg-card border-y">
            <label htmlFor="ed-coverage">
              <Switch
                id="ed-coverage"
                checked={coverage}
                onCheckedChange={setCoverage}
              />
              {t('Area ilustrasi', 'Illustrative area')}
            </label>
            <label htmlFor="ed-snap">
              <Switch id="ed-snap" checked={snap} onCheckedChange={setSnap} />
              Snap 0.25 m
            </label>
            <label htmlFor="ed-ortho">
              <Switch
                id="ed-ortho"
                checked={ortho}
                onCheckedChange={setOrtho}
              />
              {t('Siku 90°', 'Orthogonal')}
            </label>
            <NumberField
              label="Z (m)"
              value={height}
              min={0}
              max={room.height}
              step={0.25}
              onChange={setHeight}
            />
            {floor && (
              <button
                onClick={() => {
                  setFloor(null);
                  setFloorName('');
                }}
                title={floorName}
              >
                {t('Hapus denah', 'Remove floor plan')} ×
              </button>
            )}
            <span className="ed-options-end">
              {totalLength.toFixed(1)} m · {enabledPipes} pipes · {totalHoles}{' '}
              points
            </span>
          </div>
          <div className="ed-schedule bg-card">
            <div className="ed-section-heading">
              <span>
                {active.name} / Pipe {pipeId} ·{' '}
                {t('Daftar titik sampling', 'Sampling schedule')}
              </span>
              <span>
                {pipe.holes.length} points · {t('Cabang', 'Branch')} {routeName}
              </span>
            </div>
            <div className="ed-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t('Titik', 'Point')}</th>
                    <th>X (m)</th>
                    <th>Y (m)</th>
                    <th>Z (m)</th>
                    <th>Ø (mm)</th>
                    <th>{t('Input flow', 'Entered flow')} (L/min)</th>
                  </tr>
                </thead>
                <tbody>
                  {pipe.holes.map((h, i) => {
                    const v = holePosition(path, h);
                    return (
                      <tr
                        key={h.id}
                        className={
                          selection?.kind === 'hole' && selection.id === h.id
                            ? 'is-selected'
                            : ''
                        }
                        onClick={() => setSelection({ kind: 'hole', id: h.id })}
                      >
                        <td>
                          <button
                            onClick={() =>
                              setSelection({ kind: 'hole', id: h.id })
                            }
                          >
                            SP-{i + 1}
                          </button>
                        </td>
                        <td>{v.x.toFixed(2)}</td>
                        <td>{v.y.toFixed(2)}</td>
                        <td>{v.z.toFixed(2)}</td>
                        <td>{h.diameter.toFixed(2)}</td>
                        <td>{h.flow.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {!pipe.holes.length && (
                    <tr>
                      <td colSpan={6}>
                        {t(
                          'Pilih alat titik sampling, lalu klik pada rute pipa.',
                          'Select the sampling tool, then click on the pipe route.',
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <aside className="ed-inspector bg-card border-l">
          <div className="ed-section">
            <div className="ed-section-heading">
              <span>{t('Properti detector', 'Detector properties')}</span>
              <Box size={16} />
            </div>
            <label className="ed-field">
              <span>{t('Nama', 'Name')}</span>
              <Input
                value={active.name}
                onFocus={checkpoint}
                onChange={(e) =>
                  updateDetector((d) => ({ ...d, name: e.target.value }))
                }
              />
            </label>
            <ModelSelect value={active.model} onChange={changeModel} />
            <div className="ed-three">
              {(['x', 'y', 'z'] as const).map((axis) => (
                <NumberField
                  key={`${active.id}-${axis}`}
                  label={`${axis.toUpperCase()} (m)`}
                  value={active.position[axis]}
                  min={0}
                  max={
                    axis === 'x'
                      ? room.width
                      : axis === 'y'
                        ? room.length
                        : room.height
                  }
                  onChange={(v) => {
                    checkpoint();
                    updateDetector((d) => ({
                      ...d,
                      position: { ...d.position, [axis]: v },
                    }));
                  }}
                />
              ))}
            </div>
          </div>
          <div className="ed-section">
            <div className="ed-section-heading">
              <span style={{ color: PIPE_COLORS[pipeId - 1] }}>
                Pipe {pipeId}
              </span>
              <Switch
                aria-label={t('Aktifkan pipa', 'Enable pipe')}
                checked={pipe.enabled}
                onCheckedChange={(v) => {
                  checkpoint();
                  updatePipe((p) => ({ ...p, enabled: v }));
                  setDraft(null);
                }}
              />
            </div>
            <p className="ed-help">
              {t(
                `${model.ports} port tersedia · setiap pipe memiliki rute sendiri.`,
                `${model.ports} ports available · each pipe has its own route.`,
              )}
            </p>
            <div className="ed-metrics">
              <Metric
                label={t('Panjang aktual', 'Actual length')}
                value={stats.length.toFixed(2)}
                unit="m"
              />
              <Metric
                label={t('Titik sampling', 'Sampling points')}
                value={String(pipeHoleCount(physicalPipe))}
                unit=""
              />
              <Metric
                label={t('Estimasi transport', 'Est. transport')}
                value={stats.transport.toFixed(1)}
                unit="s"
              />
              <Metric
                label={t('Input total flow', 'Entered total flow')}
                value={stats.flow.toFixed(1)}
                unit="L/min"
              />
            </div>
            <div className="ed-two">
              <Button
                variant="outline"
                size="sm"
                onClick={() => chooseTool('pipe')}
                disabled={!pipe.enabled}
              >
                <Route />
                {t('Sketsa', 'Sketch')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog('delete')}
                disabled={!pipe.vertices.length}
              >
                <Trash2 />
                {t('Hapus rute', 'Delete route')}
              </Button>
            </div>
          </div>
          {(currentVertex || currentHole) && (
            <div className="ed-section">
              <div className="ed-section-heading">
                <span>
                  {currentVertex
                    ? t('Node terpilih', 'Selected node')
                    : t('Titik terpilih', 'Selected point')}
                </span>
              </div>
              {currentVertex && selection?.kind === 'vertex' && (
                <div className="ed-three">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <NumberField
                      key={`${routeId}-${selection.index}-${axis}`}
                      label={`${axis.toUpperCase()} (m)`}
                      value={currentVertex[axis]}
                      min={0}
                      max={
                        axis === 'x'
                          ? room.width
                          : axis === 'y'
                            ? room.length
                            : room.height
                      }
                      onChange={(v) => {
                        checkpoint();
                        updatePipe((p) => ({
                          ...p,
                          vertices: ortho
                            ? movePolylineNode(
                                [path[0], ...p.vertices],
                                selection.index + 1,
                                { ...p.vertices[selection.index], [axis]: v },
                              ).slice(1)
                            : p.vertices.map((x, i) =>
                                i === selection.index ? { ...x, [axis]: v } : x,
                              ),
                        }));
                      }}
                    />
                  ))}
                </div>
              )}
              {currentHole && (
                <>
                  <NumberField
                    key={`${currentHole.id}-diameter`}
                    label={t('Diameter lubang (mm)', 'Hole diameter (mm)')}
                    value={currentHole.diameter}
                    min={0.5}
                    max={10}
                    step={0.1}
                    onChange={(v) => {
                      checkpoint();
                      updatePipe((p) => ({
                        ...p,
                        holes: p.holes.map((h) =>
                          h.id === currentHole.id ? { ...h, diameter: v } : h,
                        ),
                      }));
                    }}
                  />
                  <NumberField
                    key={`${currentHole.id}-flow`}
                    label={t('Asumsi aliran (L/min)', 'Assumed flow (L/min)')}
                    value={currentHole.flow}
                    min={0.01}
                    max={100}
                    step={0.1}
                    onChange={(v) => {
                      checkpoint();
                      updatePipe((p) => ({
                        ...p,
                        holes: p.holes.map((h) =>
                          h.id === currentHole.id ? { ...h, flow: v } : h,
                        ),
                      }));
                    }}
                  />
                  <Button variant="outline" size="sm" onClick={removeSelection}>
                    <Trash2 />
                    {t('Hapus titik', 'Delete point')}
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="ed-section">
            <div className="ed-section-heading">
              <span>{t('Pemeriksaan desain', 'Design review')}</span>
            </div>
            <Check
              ok={pipe.enabled && pipe.vertices.length > 0}
              text={t(
                'Rute terhubung ke detector',
                'Route connected to detector',
              )}
            />
            <Check
              ok={stats.transport > 0 && stats.transport <= room.target}
              text={`${t('Target transport', 'Transport target')} ≤ ${room.target}s`}
            />
            <Check
              ok={
                active.pipes
                  .filter((p) => p.enabled)
                  .reduce((n, p) => n + pipeStats(active, p, room).length, 0) <=
                catalogLengthLimit
              }
              text={`${t('Batas panjang katalog', 'Catalog length limit')} ${catalogLengthLimit} m`}
            />
            <p className="ed-help">
              {t(
                'Batas lubang bergantung kelas sensitivitas dan persetujuan produk; periksa katalog.',
                'Hole limits depend on sensitivity class and product approval; check the catalog.',
              )}{' '}
              <a href={model.source} target="_blank" rel="noreferrer">
                Xtralis ↗
              </a>
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog('compare')}
            >
              {t('Bandingkan target', 'Compare targets')}
            </Button>
            <p className="ed-estimate">
              {t(
                'Panjang dihitung dari rute XYZ. Flow adalah input pengguna; waktu transport adalah estimasi awal, belum simulasi hidraulik ASPIRE atau verifikasi NFPA.',
                'Length comes from the XYZ route. Flow is user-entered; transport time is a concept estimate, not an ASPIRE hydraulic simulation or NFPA verification.',
              )}
            </p>
          </div>
        </aside>
      </div>
      <output className="ed-status bg-card border-t">
        <span>
          {message ||
            t(
              'Siap. Pilih detector dan pipe untuk mulai menggambar.',
              'Ready. Select a detector and pipe to begin drawing.',
            )}
        </span>
        <span>
          {draft
            ? t('Sketsa belum disimpan', 'Sketch not committed')
            : t('Koordinat dalam meter', 'Coordinates in meters')}
        </span>
      </output>
      <Dialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'room'
                ? t('Pengaturan proyek', 'Project settings')
                : dialog === 'delete'
                  ? t(
                      `Hapus ${active.name} / Pipe ${pipeId} / ${routeName}?`,
                      `Delete ${active.name} / Pipe ${pipeId} / ${routeName}?`,
                    )
                  : t(
                      'Perbandingan target transport',
                      'Transport target comparison',
                    )}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'delete'
                ? t(
                    'Rute terpilih, titik sampling dan cabang turunannya dihapus. Undo tersedia.',
                    'The selected route, its samples and child branches will be deleted. Undo is available.',
                  )
                : t(
                    'Parameter proyek dan estimasi awal.',
                    'Project parameters and concept estimates.',
                  )}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'room' && (
            <>
              <label className="ed-field">
                <span>{t('Nama proyek', 'Project name')}</span>
                <Input
                  value={room.name}
                  onFocus={checkpoint}
                  onChange={(e) =>
                    setDesign((d) => ({
                      ...d,
                      room: { ...d.room, name: e.target.value },
                    }))
                  }
                />
              </label>
              <div className="ed-two">
                {(
                  [
                    ['width', t('Lebar (m)', 'Width (m)')],
                    ['length', t('Panjang (m)', 'Length (m)')],
                    ['height', t('Tinggi (m)', 'Height (m)')],
                    [
                      'target',
                      t('Target transport (s)', 'Transport target (s)'),
                    ],
                    ['altitude', t('Elevasi lokasi (m)', 'Site altitude (m)')],
                  ] as const
                ).map(([key, label]) => (
                  <NumberField
                    key={key}
                    label={label}
                    value={room[key]}
                    min={key === 'altitude' ? 0 : 1}
                    max={key === 'altitude' ? 5000 : 1000}
                    onChange={(v) => changeRoom(key, v)}
                  />
                ))}
              </div>
              <Select
                value={standard}
                onValueChange={(v) => {
                  if (v) setStandard(v);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['NFPA 72:2025', 'NFPA 72:2022', 'EN 54-20'].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {dialog === 'compare' && (
            <div className="ed-comparison">
              {[60, 90, 120].map((target) => (
                <div key={target}>
                  <strong>{target} s</strong>
                  <span>
                    {stats.transport.toFixed(1)} s {t('estimasi', 'estimate')}
                  </span>
                  <Check
                    ok={stats.transport > 0 && stats.transport <= target}
                    text={t('Target proyek', 'Project target')}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      checkpoint();
                      setDesign((d) => ({ ...d, room: { ...d.room, target } }));
                      setDialog(null);
                    }}
                  >
                    {t('Gunakan target', 'Use target')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('Tutup', 'Close')}
            </Button>
            {dialog === 'delete' && (
              <Button variant="destructive" onClick={deletePipe}>
                {t('Hapus rute', 'Delete route')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ModelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <SelectTrigger className="w-full" aria-label="Detector model">
        <SelectValue>{modelFor(value).name}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MODELS.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function NumberField({
  label,
  value,
  min = 0,
  max = 1000,
  step = 0.25,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [error, setError] = useState(false);
  const text = editing ?? String(value);
  const commit = () => {
    if (editing === null) return;
    const n = parseNumeric(editing, min, max);
    if (n === null) {
      setError(true);
      return;
    }
    onChange(n);
    setEditing(null);
    setError(false);
  };
  return (
    <label className="ed-field">
      <span>{label}</span>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        aria-invalid={error}
        onFocus={(e) => {
          setEditing(String(value));
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setEditing(e.target.value);
          setError(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setEditing(null);
            setError(false);
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = parseNumeric(text, min, max) ?? value;
            onChange(
              round(clamp(n + (e.key === 'ArrowUp' ? step : -step), min, max)),
            );
            setEditing(null);
          }
        }}
      />
      {error && (
        <small className="ed-input-error">
          {min} – {max} · 14,5 / 14.5
        </small>
      )}
    </label>
  );
}
function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="ed-metric">
      <small>{label}</small>
      <strong>
        {value}
        <span>{unit}</span>
      </strong>
    </div>
  );
}
function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`ed-check ${ok ? 'is-ok' : ''}`}>
      <span>{ok ? '✓' : '○'}</span>
      {text}
    </div>
  );
}
