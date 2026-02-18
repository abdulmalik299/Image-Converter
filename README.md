# Image-Converter

A **privacy-first** image conversion website (Vite + React + TypeScript + Tailwind) designed to deploy cleanly on **GitHub Pages via GitHub Actions**.

## Features (user-focused)

- Separate tabs so users understand each conversion:
  - PNG ↔ JPG
  - PNG ↔ WebP
  - JPG ↔ WebP
  - Any Raster → Raster (PNG/JPG/WebP/BMP/GIF/AVIF/TIFF/ICO — browser-dependent)
  - Raster → SVG (advanced tracing with presets + controls)
  - SVG → Raster (export at exact size)
  - Batch ZIP (convert many files and download one ZIP)
  - Help & Tips (plain-language FAQ)

### Why users like this style (what people usually ask for)
- Privacy (no upload)
- No watermark
- Batch ZIP
- Quality slider + resize
- Transparency handling (JPG background color)

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

1. Push to GitHub (branch: `main`)
2. Settings → Pages → Source: **GitHub Actions**
3. Done (push to `main` triggers deploy)

The workflow is included at `.github/workflows/deploy.yml`.

### Vite base path
GitHub Pages project sites require `/RepoName/`.
The workflow sets `VITE_BASE` automatically to `/${repoName}/`, so deployment works without manual edits.
