(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');
  R.register({
    id: 6,
    name: 'Blog',
    rootId: 'sceneSix',
    stageId: 'sceneSixStage',
    dynamicAnchorId: 'sceneSixDynamicAnchor',
    layers: {},
    createController() { return {}; }
  });
})();
