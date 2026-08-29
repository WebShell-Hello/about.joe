(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');
  R.register({
    id: 5,
    name: 'Scene 5',
    rootId: 'sceneFive',
    stageId: 'sceneFiveStage',
    dynamicAnchorId: 'sceneFiveDynamicAnchor',
    layers: {},
    createController() { return {}; }
  });
})();
