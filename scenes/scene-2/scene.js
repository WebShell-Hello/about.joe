(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');

  R.register({
    id: 2,
    name: 'Scene 2',
    rootId: 'sceneTwo',
    stageId: 'sceneTwoStage',
    dynamicAnchorId: 'sceneTwoDynamicAnchor',
    shade: { topId: 'sceneTwoTopShade', bottomId: 'sceneTwoBottomShade' },
    layers: {
      scene2Video: {
        type: 'video', scene: 2, core: true, name: 'Scene 2 video',
        src: 'scenes/scene-2/assets/scene2-glasses.mp4',
        poster: 'scenes/scene-2/assets/scene2-poster.jpg',
        width: 1920, height: 1080, sourceWidth: 3840, sourceHeight: 2160,
        fit: 'contain', playbackRate: 1,
        x: 248.19, y: 16.92, scale: 1.235, rotation: 0,
        opacity: 1, z: 10, visible: true, locked: false
      }
    },

    createController({ editMode = false } = {}) {
      return window.createJoeSimpleVideoController?.({
        editMode,
        sceneId: 2,
        rootId: 'sceneTwo',
        videoId: 'sceneTwoVideo'
      }) || {};
    }
  });
})();
