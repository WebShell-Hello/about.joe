(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');

  R.register({
    id: 4,
    name: 'Scene 4',
    rootId: 'sceneFour',
    stageId: 'sceneFourStage',
    dynamicAnchorId: 'sceneFourDynamicAnchor',
    shade: { topId: 'sceneFourTopShade', bottomId: 'sceneFourBottomShade' },
    layers: {
      scene4Video: {
        type: 'video', scene: 4, core: true, name: 'Scene 4 video',
        src: 'scenes/scene-4/assets/scene4-screen-1080p.mp4',
        poster: 'scenes/scene-4/assets/scene4-poster-1080p.png',
        width: 1920, height: 1080, sourceWidth: 3840, sourceHeight: 2160,
        fit: 'cover', playbackRate: 1,
        x: -76.62, y: -66.02, scale: 1.0622, rotation: 0,
        opacity: 1, z: 10, visible: true, locked: false
      }
    },

    createController({ editMode = false } = {}) {
      return window.createJoeSimpleVideoController?.({
        editMode,
        sceneId: 4,
        rootId: 'sceneFour',
        videoId: 'sceneFourVideo'
      }) || {};
    }
  });
})();
