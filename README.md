# AirCard Studio

A static, client-only card artwork editor for GitHub Pages. Plain HTML, CSS and JavaScript modules: no framework, runtime dependencies, backend, accounts, analytics or remote image service.

## Use

1. Upload a wallpaper or choose a background colour.
2. Select any combination of payment networks, services, bank logos and symbols.
3. Every logo starts in a fixed template slot. Uncheck **Fixed position** to drag it, use arrow keys (Shift for larger steps), or enter its X/Y coordinates. Rechecking the box restores the preset size and position.
4. Adjust finish and opacity, hide layers or change stacking order. Under **Layer effects**, enable **Colour overlay**, **Drop shadow**, or **Outer glow** independently. Choose each effect's colour and opacity; adjust shadow softness and X/Y offset or glow spread. Effects also work while a layer is fixed and are included in the exported PNG. **Reset effects** clears just these effects; **Reset this layer** clears all customization on that layer.
5. Upload custom transparent PNG/WebP overlays. Choose **Full-card artwork** for a 1536 × 969 Photoshop export with its transparent margins preserved; choose **Individual logo** for tightly cropped logo files. Full-card artwork starts behind separate logos. Files with other aspect ratios are fitted without stretching.
6. Export the flattened 1536 × 969 PNG and import it into [AirCard](https://github.com/Mak5er/AirCard).

The rounded preview is only a preview mask. The exported PNG is rectangular and full bleed. There are no card numbers or other financial details to enter. Uploaded images stay in memory on your device; refreshing the page clears the design.

## Run locally

With Node.js 22 or newer:

```sh
npm run dev
```

Open the displayed localhost URL. This is a local development file server, not an application backend. JavaScript modules and the logo catalogue need HTTP; opening `index.html` via `file://` is not supported.

## Verify and build

```sh
npm test
npm run build
```

No dependency installation is required. The build copies only public static files into `dist/` and validates bundled SVGs and catalogue paths. Tests cover crop geometry, template alignment, multiple logos, locking/unlocking, dragging bounds, ordering, alpha masking, effect isolation, finish caching and export rendering commands. Preview and export use the same full-resolution effects renderer; effects outside the card edge are clipped by the exported canvas.

## GitHub Pages

The included `.github/workflows/pages.yml` tests, packages and publishes `dist/` on pushes to `main`. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. All application URLs are relative, so the site works at `https://USERNAME.github.io/aircard-studio/` as well as a custom domain.

For branch-based Pages publishing, the repository root also contains the ready-to-serve site and `.nojekyll`. Choose one publishing method; no Vercel, Cloudflare or external hosting service is required.

## Add a bundled brand

1. Put a self-contained SVG or transparent PNG in `assets/logos/`.
2. Add an entry to `assets/logos/catalog.json`: `id`, `name`, `category` (`network`, `service`, `issuer` or `symbol`), and a relative `src` starting with `./assets/logos/`.
3. Add provenance and usage notes to `ASSETS.md` and `assets/logos/sources.json`.

Placement lives in `model.js`. These are editable layout conventions, not universal issuer requirements. Multiple marks in a category occupy separate slots. Some small sourced raster logos can soften at large sizes; upload a better-resolution version if needed. Imported custom files are restricted to raster formats; arbitrary user SVGs are not accepted.

The library is extensible, not an exhaustive list of every payment service. Authentic AMEX Gold/Platinum decorative borders and centurion overlays are not included; import your prepared full-card PNG. Finish options apply a colour/gradient through the artwork's alpha mask, so solid-background badges are best kept in their original finish.

Optional WebMCP tools are registered only in browsers that expose `document.modelContext`; normal functionality does not depend on them. No supported live WebMCP context was available during implementation validation.

## Assets

See [ASSETS.md](./ASSETS.md). Third-party trademarks and artwork retain their respective ownership and usage terms. The project is independent of AirCard and all payment brands.
