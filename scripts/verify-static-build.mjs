import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, normalize } from 'node:path';

const root = resolve(process.cwd());
const dist = resolve(root, 'dist');
const indexPath = resolve(dist, 'index.html');

if (!existsSync(indexPath)) {
  console.error('Static build verification failed: dist/index.html is missing.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const references = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)]
  .map(match => match[1])
  .filter(value => value && !/^(?:[a-z]+:|\/\/|#|data:)/i.test(value));

const missing = [];
for (const reference of references) {
  const pathname = reference.split(/[?#]/, 1)[0];
  if (!pathname || pathname === './' || pathname === '/') continue;
  const relative = decodeURIComponent(pathname.replace(/^\.?\//, '').replace(/^\//, ''));
  const target = normalize(resolve(dist, relative));
  if (!target.startsWith(`${dist}/`) || !existsSync(target)) missing.push(reference);
}

const requiredDirectories = ['scenes', 'shared', 'data'];
const missingDirectories = requiredDirectories.filter(name => !existsSync(resolve(dist, name)));
const assetCount = references.filter(value => /\.(?:png|jpe?g|webp|avif|mp4|webm|woff2?)(?:[?#]|$)/i.test(value)).length;

if (missing.length || missingDirectories.length) {
  console.error('Static build verification failed.');
  if (missing.length) console.error(`Missing references: ${missing.join(', ')}`);
  if (missingDirectories.length) console.error(`Missing directories: ${missingDirectories.join(', ')}`);
  process.exit(1);
}

const bytes = statSync(indexPath).size;
console.log(`Static build verified: ${references.length} local references, ${assetCount} media references, index ${bytes} bytes.`);
