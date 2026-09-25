import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const catalog = JSON.parse(await readFile(path.join(root, 'assets/logos/catalog.json'), 'utf8'));
const ids = new Set();
for (const logo of catalog) {
  if (ids.has(logo.id)) throw new Error(`Duplicate logo: ${logo.id}`);
  ids.add(logo.id);
  if (!logo.src.startsWith('./assets/logos/') || logo.src.includes('..', 2)) throw new Error(`Invalid asset path: ${logo.src}`);
  const asset = path.resolve(root, logo.src);
  if (!(await stat(asset)).size) throw new Error(`Empty asset: ${logo.src}`);
  if (asset.endsWith('.svg')) {
    const svg = await readFile(asset, 'utf8');
    const references = [...svg.matchAll(/(?:href|xlink:href)\s*=\s*["']([^"']*)["']/gi)].map(match => match[1]);
    const cssReferences = [...svg.matchAll(/url\(([^)]*)\)/gi)].map(match => match[1].trim().replace(/^["']|["']$/g, ''));
    if (/<script|<foreignObject|\son\w+\s*=/i.test(svg) || references.some(ref => !ref.startsWith('#') && !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(ref)) || cssReferences.some(ref => !ref.startsWith('#'))) throw new Error(`SVG must be self-contained: ${logo.src}`);
  }
}
await mkdir(output, { recursive: true });
const files = ['index.html', 'styles.css', 'app.js', 'model.js', 'renderer.js', 'assets', '.nojekyll', 'ASSETS.md'];
for (const file of files) await cp(path.join(root, file), path.join(output, file), { recursive: true });
// The generated output contains public static assets only.
await writeFile(path.join(output, '.nojekyll'), '');
console.log(`Built static site: ${catalog.length} bundled logos; no runtime dependencies or backend.`);
console.log(`Output: ${output}`);
