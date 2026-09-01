import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const imageAssets = [
  'scenes/scene-1/assets/scene1-landscape-4k.webp',
  'scenes/scene-1/assets/Background perspective-2.webp',
  'scenes/scene-1/assets/Character perspective overlay-2.webp',
  'scenes/scene-1/assets/character-main.webp',
  'scenes/scene-1/assets/grass-2.webp',
  'scenes/scene-1/assets/grass1-2.webp',
  'scenes/scene-1/assets/grass2-2.webp',
  'scenes/scene-1/assets/grass-wireframe-a.webp',
  'scenes/scene-1/assets/grass-wireframe-b.webp',
  'scenes/scene-1/assets/grass-wireframe-c.webp',
  'scenes/scene-1/assets/rock.png',
  'scenes/scene-2/assets/scene2-poster.jpg',
  'scenes/scene-3/assets/scene3-poster.png',
  'scenes/scene-4/assets/scene4-poster.png'
];

const videoAssets = [
  'scenes/scene-2/assets/scene2-glasses.mp4',
  'scenes/scene-3/assets/scene3-pen.mp4',
  'scenes/scene-4/assets/scene4-screen.mp4'
];

function withSuffix(file, suffix) {
  const extension = extname(file);
  const stem = file.slice(0, -extension.length).replace(/-4k$/i, '');
  return `${stem}${suffix}${extension}`;
}

function ensure4kSource(file) {
  if (/-4k\.[^.]+$/i.test(file)) return file;
  const source = withSuffix(file, '-4k');
  if (!existsSync(source)) renameSync(file, source);
  return source;
}

function makeImage(file) {
  if (!existsSync(file) && !existsSync(withSuffix(file, '-4k'))) return null;
  const source = ensure4kSource(file);
  const output = withSuffix(source, '-1080p');
  const staleOutput = `${source.slice(0, -extname(source).length)}-1080p${extname(source)}`;
  if (staleOutput !== output && existsSync(staleOutput)) unlinkSync(staleOutput);
  if (!existsSync(output)) execFileSync('magick', [source, '-resize', '1920x1080>', '-strip', '-define', 'webp:method=6', '-quality', '82', output], { stdio: 'inherit' });
  return [file, output];
}

function makeVideo(file) {
  if (!existsSync(file) && !existsSync(withSuffix(file, '-4k'))) return null;
  const source = ensure4kSource(file);
  const output = withSuffix(source, '-1080p');
  const staleOutput = `${source.slice(0, -extname(source).length)}-1080p${extname(source)}`;
  if (staleOutput !== output && existsSync(staleOutput)) unlinkSync(staleOutput);
  if (!existsSync(output)) execFileSync('ffmpeg', ['-y', '-i', source, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', '-an', output], { stdio: 'inherit' });
  return [file, output];
}

const replacements = [
  ...imageAssets.map(makeImage),
  ...videoAssets.map(makeVideo)
].filter(Boolean);

const filesToUpdate = [
  'app.js',
  'index.html',
  'data/layout01.json',
  'data/layout02.json',
  'scenes/scene-1/scene.html',
  'scenes/scene-1/scene.js',
  'scenes/scene-2/scene.html',
  'scenes/scene-2/scene.js',
  'scenes/scene-3/scene.html',
  'scenes/scene-3/scene.js',
  'scenes/scene-4/scene.html',
  'scenes/scene-4/scene.js'
];

for (const file of filesToUpdate) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) continue;
  let content = readFileSync(path, 'utf8');
  for (const [original, optimized] of replacements) {
    content = content.replaceAll(original, optimized);
    content = content.replaceAll(original.replaceAll(' ', '%20'), optimized.replaceAll(' ', '%20'));
  }
  writeFileSync(path, content);
}

for (const file of ['data/layout01.json', 'data/layout02.json']) {
  const path = join(process.cwd(), file);
  const layout = JSON.parse(readFileSync(path, 'utf8'));
  for (const layer of Object.values(layout.layers || {})) {
    if (!layer || !layer.src) continue;
    const replacement = replacements.find(([, optimized]) => layer.src === optimized || layer.src === optimized.replaceAll(' ', '%20'));
    if (!replacement) continue;
    const optimized = replacement[1];
    layer.fileName = basename(optimized);
    if (/\.(mp4|webm|mov|m4v)$/i.test(optimized)) {
      layer.sourceWidth = 1920;
      layer.sourceHeight = 1080;
    } else {
      const dimensions = execFileSync('identify', ['-format', '%w %h', optimized], { encoding: 'utf8' }).trim().split(/\s+/).map(Number);
      layer.sourceWidth = dimensions[0];
      layer.sourceHeight = dimensions[1];
    }
  }
  writeFileSync(path, JSON.stringify(layout));
}

console.log(`Optimized ${replacements.length} active assets to 1080p.`);
