(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');

  const imageStyle = () => ({ brightness: 1, contrast: 1, saturation: 1, hue: 0 });
  const image = (name, role, src, width, height, x, y, scale, z, opacity = 1) => ({
    type: 'image', scene: 1, role, core: true, name, src, width, height, sourceWidth: width, sourceHeight: height,
    x, y, scale, rotation: 0, opacity, z, visible: true, locked: false,
    imageStyle: imageStyle()
  });

  R.register({
    id: 1,
    name: 'Scene 1',
    rootId: 'sceneOneShell',
    stageId: 'designStage',
    dynamicAnchorId: 'dynamicLayerAnchor',
    shade: { topId: 'sceneOneTopShade', bottomId: 'sceneTransitionShade' },
    layers: {
      eyebrow:  { type: 'text', scene: 1, core: true, name: 'Hi there', text: 'Hi there', textStyle: { fontSize: 88, fontWeight: 760, letterSpacing: -4.4, lineHeight: .94, color: '#ffffff', align: 'left' }, x: 196, y: 270, scale: 1, rotation: 0, opacity: 1, z: 30, visible: true, locked: false },
      title:    { type: 'text', scene: 1, core: true, name: 'I am Joe', text: 'I am Joe', textStyle: { fontSize: 191, fontWeight: 790, letterSpacing: -12.8, lineHeight: .88, color: '#ffffff', align: 'left' }, x: 196, y: 382, scale: 1, rotation: 0, opacity: 1, z: 28, visible: true, locked: false },
      subtitle: { type: 'text', scene: 1, core: true, name: 'Subtitle', text: 'I design work since 2022', textStyle: { fontSize: 34, fontWeight: 650, letterSpacing: -1.2, lineHeight: 1, color: '#ffffff', align: 'left' }, x: 198, y: 631, scale: 1, rotation: 0, opacity: 1, z: 31, visible: true, locked: false },
      scene1Background: image('Main background', 'main-background', 'scenes/scene-1/assets/scene1-landscape-1080p.webp', 1536, 864, -296, 0, 1.298611, 0, 1),
      backgroundPerspective: image('Background perspective', 'background-perspective', 'scenes/scene-1/assets/Background%20perspective-2-1080p.webp', 1536, 864, -64, 168, 1.0, 4, 1),
      rock: image('Rock', 'rock', 'scenes/scene-1/assets/rock.png', 1536, 1024, 322, 804, 0.71, 40),
      characterMain: image('Character body', 'character-main', 'scenes/scene-1/assets/character-main-1080p.webp', 941, 1672, 598, 214, 0.448, 50, 1),
      characterPerspective: image('Character perspective overlay', 'character-perspective', 'scenes/scene-1/assets/Character%20perspective%20overlay-2-1080p.webp', 1024, 1536, 590, 198, 0.47, 52, 0.9),
      star: { type: 'control', scene: 1, core: true, name: 'Star', x: 1310, y: 38, scale: 1, rotation: 0, opacity: 1, z: 70, visible: true, locked: false },
      scroll: { type: 'scroll', scene: 1, core: true, name: 'Scroll cue', x: 641, y: 1032, scale: 1, rotation: 0, opacity: 1, z: 70, visible: true, locked: false }
    }
  });
})();
