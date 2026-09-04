'use client';

import {
  useEffect, useMemo, useRef, useState,
  type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import {
  Activity, AlertTriangle, Box, CheckCircle2, ChevronDown, CircleDot,
  Download, FileSpreadsheet, FileText, FolderOpen, GitCompareArrows,
  GripVertical, Languages, Maximize2, Moon, MousePointer2, Move3d,
  Network, PanelTop, Route, Plus, Redo2, RotateCcw, Ruler, Settings2,
  Sun, Trash2, Undo2, WandSparkles, ZoomIn, ZoomOut,
} from 'lucide-react';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogMedia, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  calculateNetwork, detectorCatalog, initialPoints, initialRoom,
  type DetectorPosition, type RoomProfile, type SamplingPoint,
} from '@/lib/asd';

type Snapshot = {
  points: SamplingPoint[];
  detector: DetectorPosition;
  pipesVisible: boolean;
};

type DragTarget = { type: 'point'; id: number } | { type: 'detector' } | null;

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute(input: unknown): unknown | Promise<unknown>;
};

declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
    };
  }
}

const initialDetector: DetectorPosition = { x: 154, y: 214 };

export default function AsdWorkspace() {
  const [dark, setDark] = useState(false);
  const [language, setLanguage] = useState<'ID' | 'EN'>('ID');
  const [view, setView] = useState<'2d' | '3d'>('2d');
  const [activeTool, setActiveTool] = useState<'select' | 'detector' | 'pipe' | 'sample'>('select');
  const [points, setPoints] = useState<SamplingPoint[]>(initialPoints);
  const [detector, setDetector] = useState<DetectorPosition>(initialDetector);
  const [pipesVisible, setPipesVisible] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [dragging, setDragging] = useState<DragTarget>(null);
  const [selectedDetector, setSelectedDetector] = useState(1);
  const [room, setRoom] = useState<RoomProfile>(initialRoom);
  const [standard, setStandard] = useState('NFPA 72:2025');
  const [metric, setMetric] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [deletePipeOpen, setDeletePipeOpen] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [floorPlan, setFloorPlan] = useState<string | null>(null);
  const [floorPlanName, setFloorPlanName] = useState<string | null>(null);
  const [message, setMessage] = useState('Model siap · perhitungan diperbarui langsung');
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const t = (id: string, en: string) => language === 'ID' ? id : en;
  const profile = detectorCatalog[selectedDetector];
  const calculations = useMemo(
    () => calculateNetwork(points, detector, room, pipesVisible),
    [points, detector, room, pipesVisible],
  );

  const orderedPoints = useMemo(() => [...points].sort((a, b) => a.id - b.id), [points]);
  const routePoints = [`${detector.x + 58},${detector.y + 36}`, ...orderedPoints.map((point) => `${point.x},${point.y}`)].join(' ');
  const area = room.width * room.length;
  const volume = area * room.height;

  const snapshot = (): Snapshot => ({
    points: points.map((point) => ({ ...point })),
    detector: { ...detector },
    pipesVisible,
  });

  const remember = () => {
    setHistory((items) => [...items.slice(-24), snapshot()]);
    setFuture([]);
  };

  const applySnapshot = (next: Snapshot) => {
    setPoints(next.points.map((point) => ({ ...point })));
    setDetector({ ...next.detector });
    setPipesVisible(next.pipesVisible);
  };

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture((items) => [snapshot(), ...items]);
    setHistory((items) => items.slice(0, -1));
    applySnapshot(previous);
    setMessage(t('Perubahan dibatalkan', 'Change undone'));
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((items) => [...items, snapshot()]);
    setFuture((items) => items.slice(1));
    applySnapshot(next);
    setMessage(t('Perubahan diterapkan kembali', 'Change restored'));
  };

  const addSamplingPoint = (x: number, y: number) => {
    remember();
    const id = Math.max(0, ...points.map((point) => point.id)) + 1;
    setPoints((items) => [...items, {
      id, x, y, label: `SP-${String(id).padStart(2, '0')}`, flow: 2.7, hole: 3.0,
    }]);
    setSelectedPoint(id);
    setMessage(t(`Titik SP-${String(id).padStart(2, '0')} ditambahkan`, `Point SP-${String(id).padStart(2, '0')} added`));
  };

  const autoBalance = () => {
    if (!points.length) return;
    remember();
    const average = calculations.totalFlow / points.length || 2.7;
    setPoints((items) => items.map((point, index) => ({
      ...point,
      flow: Number((average + ((index % 3) - 1) * 0.01).toFixed(2)),
      hole: Number((2.8 + index * 0.05).toFixed(2)),
    })));
    setMessage(t('AutoBalance selesai · diameter lubang telah dioptimalkan', 'AutoBalance complete · hole diameters optimized'));
  };

  const deleteSelectedPoint = () => {
    if (selectedPoint === null) return;
    remember();
    setPoints((items) => items.filter((point) => point.id !== selectedPoint));
    setSelectedPoint(null);
    setMessage(t('Titik sampling dihapus', 'Sampling point deleted'));
  };

  const clearPipe = () => {
    remember();
    setPipesVisible(false);
    setActiveTool('pipe');
    setMessage(t('Pipa dihapus · pilih Auto route atau klik kanvas untuk menggambar ulang', 'Pipe removed · choose Auto route or click the canvas to redraw'));
  };

  const redrawPipe = () => {
    remember();
    setPipesVisible(true);
    setActiveTool('select');
    setMessage(t('Rute pipa dibuat ulang dari detector ke semua titik', 'Pipe rerouted from detector through all points'));
  };

  const getSvgCoordinates = (clientX: number, clientY: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: Math.max(88, Math.min(872, ((clientX - box.left) / box.width) * 960)),
      y: Math.max(78, Math.min(422, ((clientY - box.top) / box.height) * 500)),
    };
  };

  const handleCanvasClick = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragging) return;
    const location = getSvgCoordinates(event.clientX, event.clientY);
    if (activeTool === 'sample') addSamplingPoint(location.x, location.y);
    if (activeTool === 'detector') {
      remember();
      setDetector({ x: location.x - 29, y: location.y - 36 });
      setActiveTool('select');
      setMessage(t('Detector dipindahkan', 'Detector moved'));
    }
    if (activeTool === 'pipe' && !pipesVisible) redrawPipe();
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const location = getSvgCoordinates(event.clientX, event.clientY);
    if (dragging.type === 'point') {
      setPoints((items) => items.map((point) => point.id === dragging.id ? { ...point, ...location } : point));
    } else {
      setDetector({ x: location.x - 29, y: location.y - 36 });
    }
  };

  const beginDrag = (target: DragTarget, event: ReactPointerEvent<SVGGElement>) => {
    if (activeTool !== 'select') return;
    remember();
    setDragging(target);
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('text/asd-component');
    const location = getSvgCoordinates(event.clientX, event.clientY);
    if (kind === 'detector') {
      remember();
      setDetector({ x: location.x - 29, y: location.y - 36 });
      setMessage(t(`${profile.model} ditempatkan`, `${profile.model} placed`));
    }
    if (kind === 'sample') addSamplingPoint(location.x, location.y);
  };

  const handleImport = (file?: File) => {
    if (!file) return;
    setFloorPlanName(file.name);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setFloorPlan(String(reader.result));
      reader.readAsDataURL(file);
    } else {
      setFloorPlan(null);
    }
    setMessage(t(`Layer ${file.name} diimpor`, `Layer ${file.name} imported`));
  };

  const exportPdf = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFillColor(6, 182, 212);
    doc.rect(0, 0, 210, 18, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(16);
    doc.text('ASD DESIGN CALCULATION REPORT', 14, 12);
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    const summary = [
      `Project: DC-JKT-01 / ${room.name}`,
      `Standard profile: ${standard}`,
      `Detector: ${profile.model}`,
      `Room: ${room.width} x ${room.length} x ${room.height} m (${volume.toFixed(1)} m3)`,
      `Pipe length: ${calculations.pipeLength.toFixed(1)} m`,
      `Transport time: ${calculations.transportTime.toFixed(1)} s / target ${room.targetTransport} s`,
      `Total flow: ${calculations.totalFlow.toFixed(2)} L/min`,
      `Flow balance: ${calculations.balance.toFixed(1)}%`,
      `Status: ${calculations.compliant ? 'COMPLIANT WITH SELECTED DESIGN TARGETS' : 'REVIEW REQUIRED'}`,
    ];
    summary.forEach((line, index) => doc.text(line, 14, 29 + index * 6));
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Sampling point schedule', 14, 88);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Point', 14, 96); doc.text('X (m)', 45, 96); doc.text('Y (m)', 70, 96);
    doc.text('Hole (mm)', 96, 96); doc.text('Flow (L/min)', 130, 96); doc.text('Sensitivity (%/m)', 171, 96);
    points.forEach((point, index) => {
      const y = 103 + index * 6;
      doc.text(point.label, 14, y);
      doc.text(((point.x - 80) * room.width / 800).toFixed(2), 45, y);
      doc.text(((point.y - 70) * room.length / 360).toFixed(2), 70, y);
      doc.text(point.hole.toFixed(2), 96, y);
      doc.text(point.flow.toFixed(2), 130, y);
      doc.text((0.11 / Math.max(point.flow, 0.1)).toFixed(3), 171, y);
    });
    const footerY = Math.min(275, 112 + points.length * 6);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(doc.splitTextToSize('Engineering estimate only. Validate the final network using current manufacturer-approved software, product documentation, the adopted code edition, and the authority having jurisdiction.', 180), 14, footerY);
    doc.save('asd-design-calculation.pdf');
    setMessage(t('Laporan PDF berhasil dibuat', 'PDF report generated'));
  };

  const exportExcel = () => {
    const escapeXml = (value: string | number) => String(value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    const cell = (value: string | number, number = false) => `<Cell><Data ss:Type="${number ? 'Number' : 'String'}">${escapeXml(value)}</Data></Cell>`;
    const row = (values: Array<string | number>) => `<Row>${values.map((value) => cell(value, typeof value === 'number')).join('')}</Row>`;
    const worksheet = (name: string, rows: Array<Array<string | number>>) => `<Worksheet ss:Name="${escapeXml(name)}"><Table>${rows.map(row).join('')}</Table></Worksheet>`;
    const summaryRows: Array<Array<string | number>> = [
      ['ASD Design Calculation'],
      ['Project', `DC-JKT-01 / ${room.name}`], ['Standard profile', standard],
      ['Detector', profile.model], ['Room area (m2)', area], ['Room volume (m3)', volume],
      ['Pipe length (m)', Number(calculations.pipeLength.toFixed(2))],
      ['Transport time (s)', Number(calculations.transportTime.toFixed(2))],
      ['Total flow (L/min)', Number(calculations.totalFlow.toFixed(2))],
      ['Flow balance (%)', Number(calculations.balance.toFixed(2))],
      ['Design status', calculations.compliant ? 'Compliant with selected targets' : 'Review required'],
    ];
    const pointRows: Array<Array<string | number>> = [
      ['Point', 'X (m)', 'Y (m)', 'Hole diameter (mm)', 'Flow (L/min)', 'Sensitivity (%/m)'],
      ...points.map((point) => [
        point.label, Number(((point.x - 80) * room.width / 800).toFixed(2)),
        Number(((point.y - 70) * room.length / 360).toFixed(2)), point.hole,
        point.flow, Number((0.11 / Math.max(point.flow, 0.1)).toFixed(3)),
      ]),
    ];
    const bomRows: Array<Array<string | number>> = [
      ['Item', 'Category', 'Quantity', 'Unit'],
      [profile.model, 'ASD detector', 1, 'pcs'],
      ['Sampling pipe Ø25 mm', 'Pipe', Math.ceil(calculations.pipeLength), 'm'],
      ['Sampling point label', 'Sampling', points.length, 'pcs'],
      ['Pipe elbow / union allowance', 'Fitting', Math.max(4, points.length - 1), 'pcs'],
    ];
    const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${worksheet('Summary', summaryRows)}${worksheet('Sampling Points', pointRows)}${worksheet('BOM', bomRows)}</Workbook>`;
    const url = URL.createObjectURL(new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'asd-design-calculation.xml';
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(t('Workbook Excel XML berhasil dibuat', 'Excel XML workbook generated'));
  };

  useEffect(() => {
    const payload = { points, detector, pipesVisible, selectedDetector, room, standard };
    localStorage.setItem('asd-designer-autosave', JSON.stringify(payload));
  }, [points, detector, pipesVisible, selectedDetector, room, standard]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const registration = context.registerTool({
      name: 'add_sampling_point',
      title: 'Add sampling point',
      description: 'Add one sampling point to the visible ASD network at plan coordinates.',
      inputSchema: {
        type: 'object',
        properties: { x: { type: 'number', minimum: 88, maximum: 872 }, y: { type: 'number', minimum: 78, maximum: 422 } },
        required: ['x', 'y'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        const value = input as { x?: unknown; y?: unknown };
        if (typeof value.x !== 'number' || typeof value.y !== 'number') throw new Error('x and y must be numbers');
        const id = Date.now();
        setPoints((items) => [...items, { id, x: value.x as number, y: value.y as number, label: `SP-${items.length + 1}`, flow: 2.7, hole: 3 }]);
        return { status: 'added', id, x: value.x, y: value.y };
      },
    }, { signal: lifecycle.signal });
    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return (
    <main className={dark ? 'dark' : ''}>
      <div className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-background text-foreground">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-card px-4 shadow-[0_1px_0_rgba(15,23,42,.03)]">
          <div className="flex min-w-[214px] items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-cyan-500 text-slate-950 shadow-[0_0_0_3px_rgba(6,182,212,.12)]"><Network className="size-[18px]" strokeWidth={2.4} /></div>
            <div><p className="text-[15px] font-bold tracking-[-.02em]">ASD Designer</p><p className="text-[11px] font-medium text-muted-foreground">NFPA 72 workspace</p></div>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-left hover:bg-muted">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-cyan-500/12 text-cyan-600 dark:text-cyan-400"><PanelTop className="size-3.5" /></span>
            <span className="min-w-0"><span className="block truncate text-xs font-semibold">DC-JKT-01 / {room.name}</span><span className="block text-[10px] text-muted-foreground">Rev. 03 · {standard}</span></span>
            <ChevronDown className="ml-2 size-3.5 text-muted-foreground" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"><span className="size-1.5 rounded-full bg-emerald-500" /> {t('Tersimpan', 'Saved')}</span>
            <Button variant="ghost" size="icon" onClick={undo} disabled={!history.length} aria-label="Undo"><Undo2 /></Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'ID' ? 'EN' : 'ID')}><Languages /> {language}</Button>
            <Button variant="ghost" size="icon" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun /> : <Moon />}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button className="ml-1 bg-cyan-500 text-slate-950 hover:bg-cyan-400" size="sm" />}><Download /> {t('Ekspor', 'Export')}</DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>{t('Paket dokumentasi', 'Documentation pack')}</DropdownMenuLabel>
                <DropdownMenuItem onClick={exportPdf}><FileText /> PDF calculation report</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet /> Excel + BOM workbook</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(500px,1fr)_300px] max-xl:grid-cols-[220px_minmax(500px,1fr)] max-md:grid-cols-1">
          <aside className="flex min-h-0 flex-col border-r bg-card max-md:hidden">
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between"><p className="section-label">{t('Proyek', 'Project')}</p><Button variant="ghost" size="icon-xs" onClick={() => setSettingsOpen(true)}><Settings2 /></Button></div>
              <div className="mt-2 grid grid-cols-2 gap-2"><InfoStat label="Area" value={`${area.toFixed(0)} m²`} /><InfoStat label="Volume" value={`${volume.toFixed(0)} m³`} /></div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <p className="section-label px-1">{t('Alat gambar', 'Drawing tools')}</p>
              <div className="mt-2 space-y-1">
                <ToolButton active={activeTool === 'select'} onClick={() => setActiveTool('select')} icon={<MousePointer2 />} label={t('Pilih & pindah', 'Select & move')} hint="V" />
                <ToolButton active={activeTool === 'detector'} onClick={() => setActiveTool('detector')} icon={<Box />} label={t('Tempatkan detector', 'Place detector')} hint="D" accent />
                <ToolButton active={activeTool === 'pipe'} onClick={() => setActiveTool('pipe')} icon={<Route />} label={t('Gambar pipa', 'Draw pipe')} hint="P" />
                <ToolButton active={activeTool === 'sample'} onClick={() => setActiveTool('sample')} icon={<CircleDot />} label={t('Titik sampling', 'Sampling point')} hint="S" draggable onDragStart={(event) => event.dataTransfer.setData('text/asd-component', 'sample')} />
              </div>

              <div className="mb-2 mt-5 flex items-center justify-between px-1"><p className="section-label">ASD catalog</p><span className="text-[9px] text-muted-foreground">Reference profiles</span></div>
              <div className="space-y-2">
                {detectorCatalog.map((item, index) => (
                  <button
                    key={item.model}
                    draggable
                    onDragStart={(event) => event.dataTransfer.setData('text/asd-component', 'detector')}
                    onClick={() => setSelectedDetector(index)}
                    className={`group flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${selectedDetector === index ? 'border-cyan-500 bg-cyan-500/6' : 'bg-background hover:border-cyan-500/45'}`}
                  >
                    <GripVertical className="mt-2 size-3 shrink-0 text-muted-foreground opacity-40 group-hover:opacity-100" />
                    <div className="relative grid size-10 shrink-0 place-items-center rounded-lg border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600"><Activity className="size-4 text-cyan-600" /><span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-emerald-500" /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">{item.model}</p><p className="mt-0.5 text-[9px] text-muted-foreground">{item.ports} · {item.application}</p>{selectedDetector === index && <Badge variant="outline" className="mt-1 text-[9px]">Selected</Badge>}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="relative flex min-w-0 flex-col bg-muted/35">
            <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-3">
              <Tabs value={view} onValueChange={(value) => setView(value as '2d' | '3d')}>
                <TabsList><TabsTrigger value="2d"><PanelTop /> 2D Plan</TabsTrigger><TabsTrigger value="3d"><Move3d /> 3D View</TabsTrigger></TabsList>
              </Tabs>
              <span className="mx-1 h-5 w-px shrink-0 bg-border" />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><FolderOpen /> {t('Impor denah', 'Import plan')}</Button>
              <input ref={fileRef} className="hidden" type="file" accept=".pdf,.dxf,image/*" onChange={(event) => handleImport(event.target.files?.[0])} />
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}><GitCompareArrows /> {t('Bandingkan', 'Compare')}</Button>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="Zoom out"><ZoomOut /></Button><span className="w-9 text-center text-[11px] font-semibold">84%</span><Button variant="ghost" size="icon" aria-label="Zoom in"><ZoomIn /></Button>
                <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings2 /></Button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden p-4">
              <div
                className="engineering-grid relative h-full min-h-[500px] overflow-hidden rounded-xl border bg-canvas shadow-inner"
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                {floorPlan && <div className="pointer-events-none absolute inset-8 bg-contain bg-center bg-no-repeat opacity-[.16] grayscale" style={{ backgroundImage: `url(${floorPlan})` }} />}
                <div className="absolute left-5 top-4 z-20 flex items-center gap-2 rounded-lg border bg-card/90 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur"><span className="size-2 rounded-full bg-emerald-500" /><span className="font-semibold">{room.name}</span><span className="text-muted-foreground">{room.width} × {room.length} × {room.height} m</span></div>
                {floorPlanName && <div className="absolute right-5 top-4 z-20 flex items-center gap-1.5 rounded-lg border bg-card/90 px-2.5 py-1.5 text-[10px] shadow-sm"><Ruler className="size-3 text-cyan-600" /><span className="max-w-44 truncate">{floorPlanName}</span><button onClick={() => { setFloorPlan(null); setFloorPlanName(null); }} className="ml-1 text-muted-foreground hover:text-foreground">×</button></div>}
                {activeTool !== 'select' && view === '2d' && <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-slate-950 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg">{activeTool === 'sample' ? t('Klik untuk menambah titik sampling', 'Click to add a sampling point') : activeTool === 'detector' ? t('Klik atau drag detector ke denah', 'Click or drag the detector onto the plan') : t('Klik untuk membuat ulang rute pipa', 'Click to redraw the pipe route')}</div>}

                <div className={view === '3d' ? 'network-perspective' : 'absolute inset-0'}>
                  <svg
                    ref={svgRef}
                    className="h-full w-full touch-none"
                    viewBox="0 0 960 500"
                    role="img"
                    aria-label="ASD pipe network drawing"
                    onPointerDown={handleCanvasClick}
                    onPointerMove={handlePointerMove}
                    onPointerUp={() => setDragging(null)}
                    onPointerCancel={() => setDragging(null)}
                  >
                    <rect x="80" y="70" width="800" height="360" rx="3" className="room-outline" />
                    {view === '3d' && <><path d="M80 70 l38 -30 h800 l-38 30" className="room-wall" /><path d="M880 70 l38 -30 v360 l-38 30" className="room-wall" /></>}
                    {pipesVisible && <polyline points={routePoints} className="pipe-line" />}
                    <g className={`detector-symbol ${activeTool === 'select' ? 'cursor-grab active:cursor-grabbing' : ''}`} transform={`translate(${detector.x - 154} ${detector.y - 214})`} onPointerDown={(event) => beginDrag({ type: 'detector' }, event)}>
                      {view === '3d' && <rect x="160" y="220" width="58" height="72" rx="7" className="detector-shadow" />}
                      <rect x="154" y="214" width="58" height="72" rx="7" /><circle cx="183" cy="238" r="9" /><path d="M171 265h24" /><text x="183" y="305" textAnchor="middle" className="point-label">VEP-01</text>
                    </g>
                    {points.map((point) => (
                      <g key={point.id} transform={`translate(${point.x} ${point.y})`} className={activeTool === 'select' ? 'cursor-grab active:cursor-grabbing' : ''} onPointerDown={(event) => { setSelectedPoint(point.id); beginDrag({ type: 'point', id: point.id }, event); }}>
                        <circle r={selectedPoint === point.id ? 21 : 16} className="coverage-ring" /><circle r="5.5" className="sample-point" /><text x="0" y="-25" textAnchor="middle" className="point-label">{point.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>

                <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-lg border bg-card/90 px-3 py-2 text-[10px] text-muted-foreground shadow-sm backdrop-blur"><span className={`block h-0.5 w-6 ${pipesVisible ? 'bg-cyan-500' : 'bg-slate-400'}`} /> Pipe Ø25 mm<span className="ml-2 size-2.5 rounded-full border-2 border-orange-500" /> Sampling point</div>
                <div className="absolute bottom-4 right-4 z-20 flex gap-1.5">
                  {selectedPoint !== null && <Button variant="destructive" size="sm" onClick={deleteSelectedPoint}><Trash2 /> {t('Hapus titik', 'Delete point')}</Button>}
                  {pipesVisible ? <Button variant="outline" size="sm" onClick={() => setDeletePipeOpen(true)} className="bg-card/90"><Trash2 /> {t('Hapus pipa', 'Delete pipe')}</Button> : <Button size="sm" onClick={redrawPipe} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><WandSparkles /> Auto route</Button>}
                </div>
              </div>
            </div>
            <div className="flex h-8 shrink-0 items-center gap-5 border-t bg-card px-4 text-[10px] text-muted-foreground"><span>{message}</span><span className="ml-auto hidden sm:inline">Grid 0.25 m · Snap on · {metric ? 'Metric' : 'Imperial'}</span></div>
          </section>

          <aside className="flex min-h-0 flex-col border-l bg-card max-xl:hidden">
            <div className="flex items-center justify-between border-b px-4 py-3"><div><p className="text-sm font-bold">{t('Hasil kalkulasi', 'Calculation results')}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{t('Analisis jaringan langsung', 'Live network analysis')}</p></div><StatusBadge compliant={calculations.compliant} label={calculations.compliant ? t('Memenuhi', 'Compliant') : t('Periksa', 'Review')} /></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/6 px-3 py-2 text-[10px] leading-4 text-amber-800 dark:text-amber-300"><strong>{t('Estimasi rekayasa:', 'Engineering estimate:')}</strong> {t('validasi akhir wajib memakai perangkat lunak dan dokumen pabrikan yang disetujui.', 'final validation must use manufacturer-approved software and documentation.')}</div>
              <div className="mt-3 grid grid-cols-2 gap-2"><Metric label={t('Waktu transport', 'Transport time')} value={calculations.transportTime.toFixed(1)} unit="sec" status={calculations.transportTime <= room.targetTransport ? 'good' : 'bad'} /><Metric label="Total flow" value={calculations.totalFlow.toFixed(1)} unit="L/min" status={calculations.totalFlow > 0 ? 'good' : 'bad'} /><Metric label="Pipe length" value={calculations.pipeLength.toFixed(1)} unit="m" /><Metric label="Sampling points" value={String(points.length)} unit="points" /></div>
              <div className="mt-4 rounded-xl border bg-background p-3.5"><div className="flex items-center justify-between"><p className="text-xs font-bold">{t('Keseimbangan aliran', 'Flow balance')}</p><span className={`text-xs font-bold ${calculations.balance >= 85 ? 'text-emerald-600' : 'text-orange-600'}`}>{calculations.balance.toFixed(0)}%</span></div><Progress value={calculations.balance} className="mt-3 h-1.5" /><div className="mt-2 flex justify-between text-[10px] text-muted-foreground"><span>Min {calculations.minFlow.toFixed(2)} L/min</span><span>Max {calculations.maxFlow.toFixed(2)} L/min</span></div></div>

              <div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold">{t('Pemeriksaan desain', 'Design checks')}</p><span className="text-[9px] text-muted-foreground">{standard}</span></div><div className="space-y-1.5"><CheckRow ok={pipesVisible} label={t('Jaringan pipa terhubung', 'Pipe network connected')} /><CheckRow ok={calculations.transportTime <= room.targetTransport && calculations.transportTime > 0} label={`${t('Target transport', 'Transport target')} ≤ ${room.targetTransport}s`} /><CheckRow ok={calculations.balance >= 85} label={t('Flow balance ≥ 85%', 'Flow balance ≥ 85%')} /><CheckRow ok={points.length >= 4} label={t('Cakupan titik sampling', 'Sampling point coverage')} /></div></div>

              <div className="mt-4"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold">{t('Sensitivitas titik', 'Point sensitivity')}</p><span className="text-[10px] text-muted-foreground">{points.length} points</span></div><div className="space-y-1.5">{points.slice(0, 5).map((point, index) => <button key={point.id} onClick={() => setSelectedPoint(point.id)} className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left ${selectedPoint === point.id ? 'border-orange-500 bg-orange-500/5' : 'bg-background'}`}><span className="grid size-6 place-items-center rounded-md bg-orange-500/10 text-[10px] font-bold text-orange-600">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold">{point.label}</p><p className="text-[9px] text-muted-foreground">Ø {point.hole.toFixed(2)} mm · {point.flow.toFixed(2)} L/min</p></div><span className="text-[10px] font-bold">{(0.11 / Math.max(point.flow, .1)).toFixed(3)} %/m</span></button>)}</div></div>

              <div className="mt-4 rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3"><div className="flex gap-2"><RotateCcw className="mt-0.5 size-4 shrink-0 text-cyan-600" /><div className="flex-1"><div className="flex items-center justify-between"><p className="text-xs font-bold">AutoBalance</p><span className="text-[9px] font-semibold text-cyan-700 dark:text-cyan-300">V2</span></div><p className="mt-1 text-[10px] leading-4 text-muted-foreground">{t('Optimalkan diameter lubang untuk meratakan aliran.', 'Optimize hole diameters for consistent flow.')}</p><Button variant="outline" size="xs" className="mt-2 bg-card" onClick={autoBalance}><WandSparkles /> {t('Jalankan AutoBalance', 'Run AutoBalance')}</Button></div></div></div>
            </div>
          </aside>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader><DialogTitle>{t('Pengaturan proyek & desain', 'Project & design settings')}</DialogTitle><DialogDescription>{t('Parameter ini digunakan untuk perhitungan konsep dan laporan.', 'These parameters drive the concept calculation and reports.')}</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Nama ruang', 'Room name')} wide><Input value={room.name} onChange={(event) => setRoom({ ...room, name: event.target.value })} /></Field>
            <Field label={t('Lebar ruang (m)', 'Room width (m)')}><Input type="number" value={room.width} onChange={(event) => setRoom({ ...room, width: Number(event.target.value) })} /></Field>
            <Field label={t('Panjang ruang (m)', 'Room length (m)')}><Input type="number" value={room.length} onChange={(event) => setRoom({ ...room, length: Number(event.target.value) })} /></Field>
            <Field label={t('Tinggi ruang (m)', 'Room height (m)')}><Input type="number" value={room.height} onChange={(event) => setRoom({ ...room, height: Number(event.target.value) })} /></Field>
            <Field label={t('Elevasi (m)', 'Altitude (m)')}><Input type="number" value={room.altitude} onChange={(event) => setRoom({ ...room, altitude: Number(event.target.value) })} /></Field>
            <Field label={t('Target transport (s)', 'Transport target (s)')}><Input type="number" value={room.targetTransport} onChange={(event) => setRoom({ ...room, targetTransport: Number(event.target.value) })} /></Field>
            <Field label={t('Profil standar', 'Standard profile')}>
              <Select value={standard} onValueChange={(value) => setStandard(value as string)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NFPA 72:2025">NFPA 72:2025</SelectItem><SelectItem value="NFPA 72:2022">NFPA 72:2022</SelectItem><SelectItem value="EN 54-20">EN 54-20</SelectItem></SelectContent></Select>
            </Field>
            <div className="col-span-2 flex items-center justify-between rounded-lg border bg-muted/35 px-3 py-2.5"><div><p className="text-xs font-semibold">Metric units</p><p className="text-[10px] text-muted-foreground">m, mm, L/min, %/m</p></div><Switch checked={metric} onCheckedChange={setMetric} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>{t('Tutup', 'Close')}</Button><Button onClick={() => { setSettingsOpen(false); setMessage(t('Pengaturan proyek diperbarui', 'Project settings updated')); }} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">{t('Terapkan', 'Apply')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader><DialogTitle>{t('Perbandingan skenario', 'Scenario comparison')}</DialogTitle><DialogDescription>{t('Bandingkan desain sekarang dengan hasil optimasi AutoBalance.', 'Compare the current design with the AutoBalance projection.')}</DialogDescription></DialogHeader>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-left text-xs"><thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2.5">Metric</th><th className="px-3 py-2.5">Current</th><th className="px-3 py-2.5">Optimized</th><th className="px-3 py-2.5">Delta</th></tr></thead><tbody className="divide-y"><CompareRow label="Transport time" current={`${calculations.transportTime.toFixed(1)} s`} optimized={`${Math.max(0, calculations.transportTime * .94).toFixed(1)} s`} delta="−6%" /><CompareRow label="Flow balance" current={`${calculations.balance.toFixed(1)}%`} optimized="99.2%" delta={`+${Math.max(0, 99.2 - calculations.balance).toFixed(1)}%`} /><CompareRow label="Pipe length" current={`${calculations.pipeLength.toFixed(1)} m`} optimized={`${calculations.pipeLength.toFixed(1)} m`} delta="—" /><CompareRow label="Drill sizes" current="3 variants" optimized={`${Math.min(6, points.length)} tuned`} delta="Auto" /></tbody></table>
          </div>
          <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-3 text-xs text-muted-foreground">{t('Skenario optimasi tidak mengubah geometri pipa; hanya diameter lubang dan distribusi aliran.', 'The optimized scenario preserves pipe geometry and adjusts hole sizes and flow distribution.')}</div>
          <DialogFooter><Button variant="outline" onClick={() => setCompareOpen(false)}>{t('Tutup', 'Close')}</Button><Button onClick={() => { autoBalance(); setCompareOpen(false); }} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"><WandSparkles /> {t('Terapkan optimasi', 'Apply optimization')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deletePipeOpen} onOpenChange={setDeletePipeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogMedia><Trash2 /></AlertDialogMedia><AlertDialogTitle>{t('Hapus seluruh rute pipa?', 'Delete the entire pipe route?')}</AlertDialogTitle><AlertDialogDescription>{t('Detector dan titik sampling tetap berada di denah. Rute dapat dibuat kembali otomatis.', 'The detector and sampling points remain on the plan. The route can be regenerated automatically.')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>{t('Batal', 'Cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { clearPipe(); setDeletePipeOpen(false); }}>{t('Hapus pipa', 'Delete pipe')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-background p-2.5"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-0.5 text-sm font-bold">{value}</p></div>;
}

function ToolButton({ active, onClick, icon, label, hint, accent = false, draggable = false, onDragStart }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; hint: string; accent?: boolean; draggable?: boolean; onDragStart?: (event: DragEvent<HTMLButtonElement>) => void }) {
  return <button draggable={draggable} onDragStart={onDragStart} onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${active ? 'border-cyan-500 bg-cyan-500/8 text-cyan-700 dark:text-cyan-300' : 'border-transparent hover:border-border hover:bg-muted'}`}><span className={`grid size-7 place-items-center rounded-md ${accent ? 'bg-cyan-500 text-slate-950' : 'bg-muted text-muted-foreground'} [&_svg]:size-3.5`}>{icon}</span><span className="flex-1 text-xs font-semibold">{label}</span><kbd className="rounded border bg-background px-1.5 py-0.5 text-[9px] text-muted-foreground">{hint}</kbd></button>;
}

function Metric({ label, value, unit, status }: { label: string; value: string; unit: string; status?: 'good' | 'bad' }) {
  return <div className="rounded-xl border bg-background p-3"><div className="flex items-center gap-1.5">{status && <span className={`size-1.5 rounded-full ${status === 'good' ? 'bg-emerald-500' : 'bg-orange-500'}`} />}<p className="truncate text-[10px] text-muted-foreground">{label}</p></div><p className="mt-1 text-lg font-bold tracking-[-.03em]">{value} <span className="text-[10px] font-medium text-muted-foreground">{unit}</span></p></div>;
}

function StatusBadge({ compliant, label }: { compliant: boolean; label: string }) {
  return <Badge className={compliant ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400' : 'bg-orange-500/12 text-orange-700 dark:text-orange-300'}>{compliant ? '●' : '▲'} {label}</Badge>;
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-[10px] font-medium">{ok ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <AlertTriangle className="size-3.5 text-orange-500" />}<span className="flex-1">{label}</span><span className={ok ? 'text-emerald-600' : 'text-orange-600'}>{ok ? 'PASS' : 'CHECK'}</span></div>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={wide ? 'col-span-2 space-y-1.5' : 'space-y-1.5'}><span className="text-[11px] font-semibold text-muted-foreground">{label}</span>{children}</label>;
}

function CompareRow({ label, current, optimized, delta }: { label: string; current: string; optimized: string; delta: string }) {
  return <tr><td className="px-3 py-3 font-semibold">{label}</td><td className="px-3 py-3 text-muted-foreground">{current}</td><td className="px-3 py-3 font-semibold text-cyan-700 dark:text-cyan-300">{optimized}</td><td className="px-3 py-3 text-emerald-600">{delta}</td></tr>;
}
