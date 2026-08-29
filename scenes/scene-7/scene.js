(() => {
  'use strict';
  const R = window.JoeScenes;
  if (!R) throw new Error('JoeScenes registry is not loaded.');
  R.register({
    id: 7,
    name: 'Contact',
    rootId: 'sceneSeven',
    stageId: 'sceneSevenStage',
    dynamicAnchorId: 'sceneSevenDynamicAnchor',
    layers: {},
    createController() { return {}; }
  });
})();
