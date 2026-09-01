(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');

  R.register({
    id: 3,
    name: 'Scene 3',
    rootId: 'sceneThree',
    stageId: 'sceneThreeStage',
    dynamicAnchorId: 'sceneThreeDynamicAnchor',
    shade: { topId: 'sceneThreeTopShade', bottomId: 'sceneThreeBottomShade' },
    layers: {
      scene3Video: {
        type: 'video', scene: 3, core: true, name: 'Scene 3 video',
        src: 'scenes/scene-3/assets/scene3-pen-1080p.mp4',
        poster: 'scenes/scene-3/assets/scene3-poster-1080p.png',
        width: 1920, height: 1080, sourceWidth: 3840, sourceHeight: 2160,
        fit: 'cover', playbackRate: 1,
        x: 0, y: 0, scale: 1, rotation: 0,
        opacity: 1, z: 10, visible: true, locked: false
      }
    },

    createController({ editMode = false } = {}) {
      return window.createJoeSimpleVideoController?.({
        editMode,
        sceneId: 3,
        rootId: 'sceneThree',
        videoId: 'sceneThreeVideo'
      }) || {};
    }
  });
})();
