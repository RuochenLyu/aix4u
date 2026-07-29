/**
 * Copies the latin subsets we actually use out of the Fontsource packages into
 * public/fonts/, so the site self-hosts its type and never touches a CDN.
 * Run after bumping the @fontsource/* devDependencies: `npm run sync-fonts`.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  ['@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2', 'silkscreen-latin-400.woff2'],
  ['@fontsource/silkscreen/files/silkscreen-latin-700-normal.woff2', 'silkscreen-latin-700.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'ibm-plex-mono-latin-400.woff2'],
];

await mkdir(resolve(root, 'public/fonts'), { recursive: true });
for (const [from, to] of FILES) {
  await copyFile(resolve(root, 'node_modules', from), resolve(root, 'public/fonts', to));
  console.log(`fonts: ${to}`);
}
