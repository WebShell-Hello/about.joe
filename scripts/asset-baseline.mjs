import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const outputDir = join(root, 'reports');
const outputFile = join(outputDir, 'asset-baseline.md');
const ignored = new Set(['.git', 'node_modules', 'dist', '__pycache__']);
const mediaExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.mp4', '.webm', '.mov', '.m4v']);
const typeFor = ext => ['.mp4', '.webm', '.mov', '.m4v'].includes(ext) ? 'Video' : 'Image';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(absolute));
    else files.push(absolute);
  }
  return files;
}

function sceneFor(path) {
  const match = path.match(/scenes[\\/]scene-(\d+)[\\/]/);
  return match ? Number(match[1]) : null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  do { value /= 1024; unit += 1; } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function percent(value, total) {
  return total ? `${((value / total) * 100).toFixed(1)}%` : '0.0%';
}

const allPaths = await filesIn(root);
const records = [];
for (const absolute of allPaths) {
  const relativePath = relative(root, absolute).replaceAll('\\', '/');
  const extension = extname(relativePath).toLowerCase();
  const info = await stat(absolute);
  records.push({ path: relativePath, bytes: info.size, extension, scene: sceneFor(relativePath) });
}

const media = records.filter(record => mediaExtensions.has(record.extension));
const sourceRecords = records.filter(record => !record.path.startsWith('reports/'));
const sourceTotal = sourceRecords.reduce((sum, record) => sum + record.bytes, 0);
const mediaTotal = media.reduce((sum, record) => sum + record.bytes, 0);
const sceneTotals = new Map();
for (const record of sourceRecords) {
  const scene = record.scene || 0;
  sceneTotals.set(scene, (sceneTotals.get(scene) || 0) + record.bytes);
}

const initialPaths = new Set([
  'index.html', 'app.js', 'scenes/manifest.js',
  'shared/style.css', 'shared/runtime.js', 'shared/editor.js',
  'scenes/scene-1/scene.html', 'scenes/scene-1/scene.css',
  'scenes/scene-1/scene.js', 'scenes/scene-1/digital-rain.js'
]);
const initialRecords = sourceRecords.filter(record => initialPaths.has(record.path) || record.scene === 1);
const initialTotal = initialRecords.reduce((sum, record) => sum + record.bytes, 0);
const dwellPreload = media.filter(record => [2, 3, 4].includes(record.scene));
const dwellTotal = dwellPreload.reduce((sum, record) => sum + record.bytes, 0);

const sceneRows = [
  ['首屏可见资源', initialTotal, 'Home 必须显示的代码和 Scene 1 素材'],
  ['首屏驻留预加载', dwellTotal, '停留 Home 时准备的 Scene 2–4 图片和视频'],
  ...[1, 2, 3, 4, 5, 6, 7].map(scene => [`Scene ${scene}`, sceneTotals.get(scene) || 0, '按路径归属的全部资源'])
];

const largest = [...media].sort((a, b) => b.bytes - a.bytes).slice(0, 12);
const pieRows = [
  ['首屏可见', initialTotal],
  ['驻留预加载', dwellTotal],
  ['其他资源', Math.max(0, sourceTotal - initialTotal - dwellTotal)]
].filter(([, bytes]) => bytes > 0);

const generatedAt = new Date().toISOString();
const lines = [
  '# Joe-IP Asset Baseline',
  '',
  `生成时间：${generatedAt}`, '',
  '> 这是源文件体积报告，不等同于浏览器实际传输量。浏览器缓存、压缩和视频 Range 请求需要在 Network 面板单独验证。', '',
  '## 总览', '',
  '| 指标 | 大小 | 占项目源文件 | 说明 |',
  '|---|---:|---:|---|',
  ...sceneRows.map(([label, bytes, note]) => `| ${label} | ${formatBytes(bytes)} | ${percent(bytes, sourceTotal)} | ${note} |`),
  `| **全部源文件** | **${formatBytes(sourceTotal)}** | **100.0%** | 排除 node_modules、dist、报告和临时目录 |`,
  '',
  '## 体积分布', '',
  '```mermaid',
  'pie showData',
  '    title Joe-IP resource baseline',
  ...pieRows.map(([label, bytes]) => `    "${label} (${formatBytes(bytes)})" : ${bytes}`),
  '```', '',
  '饼图将资源分成三类：首屏可见资源、为保证后续播放流畅而在首屏驻留期间预加载的媒体，以及其他资源。', '',
  '## 媒体资源', '',
  '| Scene | 文件 | 类型 | 大小 |',
  '|---:|---|---|---:|',
  ...[...media].sort((a, b) => (a.scene || 99) - (b.scene || 99) || b.bytes - a.bytes)
    .map(record => `| ${record.scene || '-'} | \`${record.path}\` | ${typeFor(record.extension)} | ${formatBytes(record.bytes)} |`),
  `|  | **媒体合计** |  | **${formatBytes(mediaTotal)}** |`, '',
  '## 最大文件', '',
  '| 文件 | 类型 | 大小 | 占全部源文件 |',
  '|---|---|---:|---:|',
  ...largest.map(record => `| \`${record.path}\` | ${typeFor(record.extension)} | ${formatBytes(record.bytes)} | ${percent(record.bytes, sourceTotal)} |`),
  '',
  '## 如何更新', '',
  '```bash',
  'npm run analyze:assets',
  '```', '',
  '报告文件：`reports/asset-baseline.md`。建议每次替换图片、重新编码视频或新增项目后重新生成，并用 `git diff -- reports/asset-baseline.md` 查看变化。', ''
];

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, `${lines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
console.log(`Asset baseline written to ${relative(root, outputFile)}`);
console.log(`Source files: ${formatBytes(sourceTotal)}`);
console.log(`Home visible: ${formatBytes(initialTotal)}`);
console.log(`Dwell preload: ${formatBytes(dwellTotal)}`);
