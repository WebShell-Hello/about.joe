import { readFileSync, writeFileSync } from 'node:fs';

const files = ['data/layout01.json', 'data/layout02.json'];

for (const file of files) {
  const layout = JSON.parse(readFileSync(file, 'utf8'));
  const sourceLayers = Object.entries(layout.layers || {}).filter(([, layer]) => (
    layer?.type === 'text' && Number(layer.scene) === 1 && !layer.displayGroup?.includes('digital')
  ));

  for (const [id, source] of sourceLayers) {
    const digitalId = `digital-${id}`;
    if (layout.layers[digitalId]) continue;
    layout.layers[digitalId] = {
      ...source,
      core: false,
      name: `${source.name || id} Digital`,
      displayGroup: 'digital',
      locked: false,
      visible: true,
      opacity: 1
    };
  }

  writeFileSync(file, JSON.stringify(layout));
}

console.log('Added editable digital text layers to both layouts.');
