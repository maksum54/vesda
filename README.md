# ASD Designer

An interactive concept-design workspace for aspirating smoke detection (ASD) pipe networks. The current workflow uses one ASD per room, meter-based XYZ geometry, tee branches within each inlet, a synchronized plan/3D drawing, and bilingual documentation exports. Previously saved multi-detector projects remain readable; the detector-array creation controls have been removed.

## Included in this release

- Orthographic 3D view with red elevated pipes, a shaded floor, sample drop lines, illustrative sampling-area rings, rotation, zoom, and pan
- One ASD per room; model selection and direct positioning without detector-count inputs
- Number fields accept comma or point decimals, allow clearing/retyping, and commit on blur or Enter
- Room resizing proportionally scales the full network, including tee branches, without rejecting smaller dimensions
- Drag each detector or edit its X/Y/Z coordinates; existing route bends stay fixed
- Independent Pipe 1–4 tabs with separate enable controls, routes, sampling holes, and calculations
- VEP 1-pipe and 4-pipe models; VEU and VES 4-pipe profiles, linked to Xtralis sources
- Manual polyline sketching with optional 90° bends, 0.25 m snap, editable elevation, and draggable bend nodes
- True tee branches A/B/C within the same Pipe 1–4 inlet; parent junctions stay connected and common trunk length is counted once
- Per-branch, per-segment sampling recommendations with editable point counts and positions
- Sampling points anchored to route segments, including elevated pipes in isometric view
- Undo/redo for route, detector, and point changes
- Image floor-plan overlay, room dimensions, altitude, and transport target comparison
- PDF report with vector isometric drawing; Excel-compatible XML with all detectors, pipes, coordinates, points, and BOM
- Indonesian/English and light/dark modes
- Local autosave restored on startup; JSON project backup/import
- Migration of compatible legacy single-detector autosaves; the original storage key is preserved

## Drawing workflow

1. Select the room's ASD model. Edit room dimensions with comma or point decimals; changing an axis scales that axis of the drawing. The original geometry is recoverable through Undo.
2. Select Pipe 1, 2, 3, or 4. Enable the pipe if it is off. A VEP 1-pipe detector disables tabs 2–4.
3. Select **Sketch pipe** (`P`). Click to place bends at the chosen Z elevation; press **Enter** or **Finish** to commit. **Escape** cancels the unfinished sketch. Drawing on an existing route extends its endpoint.
4. To split an inlet, choose **Tee branch** (`T`), click the connection on an existing pipe, then sketch the new branch and press Enter. The new branch shares the parent junction, not the endpoint of branch A.
5. Select branch A/B in the sidebar. Check the horizontal sections that need sampling. The initial recommendation is `ceil(section length / target spacing)` per selected section (default spacing 6 m, editable). Override the total count, then **Apply to selected sections**. This replaces samples only on those sections and can be undone. Points are spread with half-spacing end margins; count allocation favors longer sections.
6. Select **Sampling point** (`S`) for manual placement. Use **Select / move** (`V`) to slide points or drag bends. Orthogonal mode preserves right-angle constraints and attached tee geometry. Point diameter and assumed flow remain editable.
7. Select **3D Isometric** to see risers and elevations, rotate by 90°, or pan (`H`). The green rings visualize half the chosen spacing radius and are not verified NFPA coverage zones.
8. Export PDF, Excel XML, or JSON. Branch coordinates, sampling schedules, and tee counts are included. Deleting a branch deletes its descendants; deleting main route A clears that inlet. Undo restores the deletion.

VEA uses a different microbore architecture (40 tubes) and is explicitly excluded from the Pipe 1–4 editor. A four-port detector cannot be changed to a one-port model while Pipe 2–4 contain geometry.

## Calculation scope

Pipe length is the sum of actual 3D segment lengths. Total flow is the sum of user-entered hole flows. The inherited transport formula is a concept estimate: `(14 + length_m * 0.31 + hole_count * 0.72) * (1 + altitude_m / 18000)`.

These values do not perform hydraulic balancing, determine hole sensitivity, or establish NFPA compliance. The former demonstration AutoBalance is not exposed as a physical optimizer. NFPA/EN selections record the project's reference standard; model limits come from the [Xtralis VESDA-E Pocket Guide](https://xtralis.com/file/10310) and the [VEP product page](https://xtralis.com/product/165/vesda-e-vep-aspirating-smoke-detector).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Create a production build:

```bash
npm run build
```

Run the geometry, port capacity, persistence, migration, and sampling-anchor regression checks with `npm test`. Type-check using `npx tsc --noEmit`.

## Deploy to Vercel

Connect this repository in Vercel and keep the project root at the repository root. The included `vercel.json` runs the production build and publishes the static export from `dist/client`.

If a production URL shows Vercel's `404: NOT_FOUND`, verify that the domain is assigned to the latest production deployment under **Project Settings → Domains**. To make the site publicly accessible, disable **Vercel Authentication** for Production under **Project Settings → Deployment Protection**.

## Engineering disclaimer

This repository is an engineering prototype and calculation-assistance tool. It is not a product listing, approval, certification, or substitute for current manufacturer-approved pipe-network calculation software. Final designs must be checked against current product documentation, the code edition adopted for the project, installation conditions, and the authority having jurisdiction (AHJ).

Product and company names are used only to identify reference profiles. VESDA and VESDA-E are trademarks of their respective owner. No proprietary product manuals or catalog assets are bundled in this repository.
