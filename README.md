# ASD Designer

An interactive concept-design workspace for aspirating smoke detection (ASD) pipe networks. The application combines a synchronized 2D/3D editor, detector reference profiles, live calculation feedback, AutoBalance, bilingual UI, and engineering report exports.

## Included in this release

- 2D ASD layout with movable detector and sampling points
- Drag-and-drop detector and sampling components
- Delete and automatically redraw the pipe route
- Synchronized perspective 3D network view
- Room dimensions, altitude, transport-time target, and standards profile
- Live pipe length, transport time, airflow, balance, and sensitivity estimates
- AutoBalance sampling-hole optimization
- NFPA 72:2022, NFPA 72:2025, and EN 54-20 design profiles
- VESDA-E reference detector catalog
- Image/PDF/DXF floor-plan attachment workflow
- Current-versus-optimized scenario comparison
- PDF calculation report and Excel-compatible XML workbook with BOM
- Indonesian/English language switch
- Light and dark themes
- Autosave to browser storage and an `add_sampling_point` WebMCP tool

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

## Engineering disclaimer

This repository is an engineering prototype and calculation-assistance tool. It is not a product listing, approval, certification, or substitute for current manufacturer-approved pipe-network calculation software. Final designs must be checked against current product documentation, the code edition adopted for the project, installation conditions, and the authority having jurisdiction (AHJ).

Product and company names are used only to identify reference profiles. VESDA and VESDA-E are trademarks of their respective owner. No proprietary product manuals or catalog assets are bundled in this repository.
