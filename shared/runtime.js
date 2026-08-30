
(() => {
  'use strict';

  /** @typedef {import('../src/types').Layout} Layout */
  /** @typedef {import('../src/types').LayoutCandidate} LayoutCandidate */
  /** @typedef {import('../src/types').SceneId} SceneId */
  /** @typedef {import('../src/types').Layer} Layer */

  const DESIGN_W = 1402;
  const DESIGN_H = 1122;
  const CHAR_W = 941;
  const CHAR_H = 1672;
  const STORAGE_KEY = 'joe-scene1-layout-v3';
  const API_LAYOUT = '/api/layout';
  const API_EDIT_SESSION = '/api/edit-session';
  const API_VERSION = '/api/version';
  const REQUIRED_SERVER_VERSION = 24;
  const API_UPLOAD = '/api/upload';
  const API_DELETE_ASSET = '/api/delete-asset';
  const UI_LANG_KEY = 'joe-ui-language-v1';
  const EDIT_SESSION_KEY = 'joe-scene1-edit-session-v1';

  const VIEW_MODE_KEY = 'joe-view-mode-v1';
  const VIEW_STATE_KEY = 'joe-view-state-v2';
  const LEGACY_UI_LANG_KEY = 'joe-ui-language-v1';

  function safeSessionGet(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } }
  function safeSessionSet(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} }
  function safeSessionRemove(key) { try { sessionStorage.removeItem(key); } catch (_) {} }

  // Backward compatibility: consume old query parameters once, convert them
  // to internal session state, then remove them from the visible URL.
  const legacyParams = new URLSearchParams(location.search);
  const legacyMode = legacyParams.get('edit') === '1' ? 'edit' : (legacyParams.get('preview') === '1' ? 'preview' : null);
  const legacyLang = legacyParams.get('lang');
  const legacyScene = Number(legacyParams.get('scene'));
  const legacyRel = Number(legacyParams.get('rel'));
  if (legacyMode) safeSessionSet(VIEW_MODE_KEY, legacyMode);
  if (legacyLang === 'zh' || legacyLang === 'en') safeSessionSet(UI_LANG_KEY, legacyLang);
  if (Number.isFinite(legacyScene) && Number.isFinite(legacyRel)) {
    safeSessionSet(VIEW_STATE_KEY, JSON.stringify({ scene: legacyScene, rel: legacyRel, pending: true }));
  }
  if (location.search) history.replaceState({ ...(history.state || {}), cleanUrl: true }, '', location.pathname + location.hash);

  const viewMode = safeSessionGet(VIEW_MODE_KEY) || 'normal';
  const editMode = viewMode === 'edit';
  const previewMode = viewMode === 'preview';
  /** @type {Layout|null} */
  let layout = null;
  if (editMode) document.body.classList.add('is-editing');
  else if (previewMode) document.body.classList.add('is-previewing');
  else { try { sessionStorage.removeItem(EDIT_SESSION_KEY); } catch (_) {} }

  function normaliseUiLanguage(value) { return value === 'zh' ? 'zh' : 'en'; }
  // Language is deliberately internal. sessionStorage owns the active tab;
  // legacy localStorage is used once only as a migration fallback.
  let legacyStoredLanguage = null;
  try { legacyStoredLanguage = localStorage.getItem(LEGACY_UI_LANG_KEY); } catch (_) {}
  let uiLanguage = normaliseUiLanguage(safeSessionGet(UI_LANG_KEY) || legacyStoredLanguage || 'en');
  safeSessionSet(UI_LANG_KEY, uiLanguage);
  // Remove the old persistent preference after one migration so future tabs
  // no longer depend on localStorage for language state.
  if (!safeSessionGet(UI_LANG_KEY) && legacyStoredLanguage) {
    try { localStorage.removeItem(LEGACY_UI_LANG_KEY); } catch (_) {}
  } else if (legacyStoredLanguage) {
    try { localStorage.removeItem(LEGACY_UI_LANG_KEY); } catch (_) {}
  }

  function syncUiLanguage() {
    document.documentElement.lang = uiLanguage === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-ui-lang]').forEach(/** @param {HTMLElement} button */ (button) => {
      const active = button.dataset.uiLang === uiLanguage;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-ui-language-toggle]').forEach(button => {
      const nextLanguage = uiLanguage === 'zh' ? 'en' : 'zh';
      button.textContent = '文/A';
      button.setAttribute('aria-label', nextLanguage === 'zh' ? '切换到中文' : 'Switch to English');
      button.setAttribute('title', nextLanguage === 'zh' ? '切换到中文' : 'Switch to English');
    });
    const entry = /** @type {HTMLAnchorElement|null} */ (document.getElementById('adminEntry'));
    if (entry) {
      entry.textContent = uiLanguage === 'zh' ? '编辑模式' : 'EDIT MODE';
      entry.setAttribute('aria-label', uiLanguage === 'zh' ? '打开场景编辑器' : 'Open Scene editor');
      entry.href = './';
    }
    const preview = /** @type {HTMLAnchorElement|null} */ (document.getElementById('previewLink'));
    if (preview) preview.href = './';
    const returnEditor = /** @type {HTMLAnchorElement|null} */ (document.getElementById('previewReturnEditor'));
    if (returnEditor) {
      returnEditor.href = './';
      returnEditor.textContent = uiLanguage === 'zh' ? '返回编辑器' : 'Return to editor';
      returnEditor.setAttribute('aria-label', uiLanguage === 'zh' ? '返回编辑器' : 'Return to editor');
    }
    const defaultTitle = uiLanguage === 'zh' ? 'Joe 的作品集' : "Joe's Portfolio";
    document.title = String(layout?.siteTitle?.[uiLanguage] || defaultTitle);
    const navLabels = uiLanguage === 'zh'
      ? { 1:'首页', 2:'关于', 3:'经历', 4:'技能', 5:'项目', 6:'博客', 7:'联系' }
      : { 1:'Home', 2:'About', 3:'Experience', 4:'Skills', 5:'Projects', 6:'Blog', 7:'Contact' };
    document.querySelectorAll('[data-nav-scene]').forEach(/** @param {HTMLElement} link */ (link) => {
      const label = navLabels[Number(link.dataset.navScene)];
      if (label && link.id !== 'globalSiteBrand') link.textContent = label;
    });
    const nav = document.getElementById('globalSiteNav');
    if (nav) nav.setAttribute('aria-label', uiLanguage === 'zh' ? '作品集导航' : 'Portfolio navigation');
  }

  function setUiLanguage(next) {
    const lang = normaliseUiLanguage(next);
    if (lang === uiLanguage) { syncUiLanguage(); return; }
    uiLanguage = lang;
    safeSessionSet(UI_LANG_KEY, uiLanguage);
    syncUiLanguage();
    if (layout) applyLayout();
    window.dispatchEvent(new CustomEvent('ui-language-change', { detail: { language: uiLanguage } }));
  }

  document.querySelectorAll('[data-ui-lang]').forEach(/** @param {HTMLElement} button */ (button) => {
    button.addEventListener('click', () => setUiLanguage(button.dataset.uiLang));
  });
  document.querySelectorAll('[data-ui-language-toggle]').forEach(/** @param {HTMLElement} button */ (button) => {
    button.addEventListener('click', () => setUiLanguage(uiLanguage === 'zh' ? 'en' : 'zh'));
  });
  syncUiLanguage();

  const adminEntry = document.getElementById('adminEntry');
  const previewReturnEditor = document.getElementById('previewReturnEditor');

  const root = document.documentElement;
  const body = document.body;
  const sceneRegistry = window.JoeScenes;
  const SCENE_IDS=(sceneRegistry?.manifest||[]).map(entry=>Number(entry.id)).filter(Number.isFinite).sort((a,b)=>a-b);
  const MIN_SCENE_ID=SCENE_IDS.length?Math.min(...SCENE_IDS):0;
  const MAX_SCENE_ID=SCENE_IDS.length?Math.max(...SCENE_IDS):9;
  /** @returns {SceneId} */
  const validSceneId=(value,fallback=MIN_SCENE_ID)=>{const n=Number(value);return /** @type {SceneId} */ (SCENE_IDS.includes(n)?n:(SCENE_IDS.includes(Number(fallback))?Number(fallback):(SCENE_IDS[0]??1)));};
  function captureViewportLocation() {
    const center = window.innerHeight * 0.5;
    const cinematicStory=window.__joeSimpleVideoStory;
    if(!editMode&&cinematicStory?.active&&cinematicStory.currentSceneId>=2&&cinematicStory.currentSceneId<=5){
      return {scene:Number(cinematicStory.currentSceneId),rel:0.5,offsetPx:center};
    }
    let best = null;
    for (const module of (sceneRegistry?.all() || [])) {
      const el = module?.rootId ? document.getElementById(module.rootId) : null;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const distance = rect.top <= center && rect.bottom >= center ? 0 : Math.min(Math.abs(rect.top-center), Math.abs(rect.bottom-center));
      if (!best || distance < best.distance) best = { scene: module.id, rel: Math.max(0, Math.min(1, (center - rect.top) / Math.max(1, rect.height))), offsetPx: Math.max(0, Math.min(window.innerHeight, center - rect.top)), distance };
    }
    return best || { scene: SCENE_IDS[0] ?? 0, rel: 0 };
  }

  function storeViewportLocation(view = captureViewportLocation()) {
    const rawScene=Number(view.scene); const state={scene:Number.isFinite(rawScene)?rawScene:(SCENE_IDS[0]??0),rel:Math.max(0,Math.min(1,Number(view.rel)||0)),offsetPx:Math.max(0,Number(view.offsetPx)||0),pos:Math.max(0,Number(window.scrollY)||0),pending:true};
    safeSessionSet(VIEW_STATE_KEY, JSON.stringify(state));
    try { history.replaceState({ ...(history.state || {}), joeView: state }, '', location.pathname + location.hash); } catch (_) {}
    return state;
  }

  function switchViewMode(mode, view = captureViewportLocation()) {
    const nextMode = mode === 'edit' || mode === 'preview' ? mode : 'normal';
    storeViewportLocation(view);
    safeSessionSet(VIEW_MODE_KEY, nextMode);
    // Reload the same clean URL. Mode, language and scroll restoration all
    // live in sessionStorage/history.state, never in the address bar.
    location.reload();
  }

  adminEntry?.addEventListener('click', event => {
    if (editMode || previewMode) return;
    event.preventDefault();
    switchViewMode('edit');
  });
  previewReturnEditor?.addEventListener('click', event => {
    if (!previewMode) return;
    event.preventDefault();
    switchViewMode('edit');
  });
  const scene1Module = sceneRegistry?.get(1);
  const stage = document.getElementById(scene1Module?.stageId || 'designStage');
  const sceneOneShell = document.getElementById(scene1Module?.rootId || 'sceneOneShell');
  const backgroundImage=document.getElementById('backgroundImage');
  const sceneOneBackgroundSurface = sceneOneShell?.querySelector('.viewport-background') || null;
  const backgroundGrade = sceneOneBackgroundSurface?.querySelector('.background-grade') || null;
  const sceneBackgroundEls={};
  const sceneShadeEls={};
  const sceneTransitionShadeEls={};
  const sceneHoldEls={};
  function sceneRootFor(scene){const module=sceneRegistry?.get(Number(scene));return module?.rootId?document.getElementById(module.rootId):null;}
  function ensureSceneHoldElement(scene){
    const id=Number(scene),rootEl=sceneRootFor(id);if(!rootEl)return null;
    if(id===1){const existing=rootEl.querySelector('.scene-one-sticky');sceneHoldEls[id]=existing||rootEl;return sceneHoldEls[id];}
    if(sceneHoldEls[id]?.isConnected)return sceneHoldEls[id];
    let hold=rootEl.querySelector(':scope > .scene-runtime-hold');
    if(!hold){
      hold=document.createElement('div');hold.className='scene-runtime-hold';
      const nodes=Array.from(rootEl.childNodes);nodes.forEach(node=>hold.appendChild(node));rootEl.appendChild(hold);
    }
    const overflow=getComputedStyle(rootEl).overflow;
    if(!rootEl.dataset.sceneOriginalOverflow)rootEl.dataset.sceneOriginalOverflow=overflow||'visible';
    if(overflow&&overflow!=='visible')rootEl.style.overflow='visible';
    /** @type {HTMLElement} */ (hold).style.overflow=overflow&&overflow!=='visible'?overflow:'visible';
    sceneHoldEls[id]=hold;return hold;
  }
  for(const scene of SCENE_IDS)ensureSceneHoldElement(scene);
  function ensureSceneEffectElements(scene){
    const module=sceneRegistry?.get(Number(scene));
    const sceneRoot=module?.rootId?document.getElementById(module.rootId):null;
    if(!sceneRoot)return null;const effectHost=ensureSceneHoldElement(scene)||sceneRoot;
    let top=module?.shade?.topId?document.getElementById(module.shade.topId):null;
    if(!top||!top.classList.contains('scene-edge-shade')){top=effectHost.querySelector('.scene-managed-edge-top');if(!top){top=document.createElement('div');top.className='scene-edge-shade scene-edge-shade-top scene-managed-edge-top';top.setAttribute('aria-hidden','true');effectHost.appendChild(top)}}
    let bottom=module?.shade?.bottomId?document.getElementById(module.shade.bottomId):null;
    if(!bottom||!bottom.classList.contains('scene-edge-shade')){bottom=effectHost.querySelector('.scene-managed-edge-bottom');if(!bottom){bottom=document.createElement('div');bottom.className='scene-edge-shade scene-edge-shade-bottom scene-managed-edge-bottom';bottom.setAttribute('aria-hidden','true');effectHost.appendChild(bottom)}}
    let transition=effectHost.querySelector('.scene-transition-shade');
    if(!transition){transition=document.createElement('div');transition.className='scene-transition-shade';transition.setAttribute('aria-hidden','true');effectHost.appendChild(transition)}
    sceneShadeEls[scene]={top,bottom};sceneTransitionShadeEls[scene]=transition;return {top,bottom,transition};
  }
  for(const scene of SCENE_IDS)ensureSceneEffectElements(scene);
  const transitionShade = sceneTransitionShadeEls[1] || document.getElementById('sceneTransitionShade');
  const star = document.querySelector('.star-button');
  const dynamicAnchor = document.getElementById(scene1Module?.dynamicAnchorId || 'dynamicLayerAnchor');
  const alphaCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('alphaCanvas'));
  const alphaCtx = alphaCanvas.getContext('2d', { willReadFrequently: true });

  const elMap = {};
  const coreDomHomes={};
  document.querySelectorAll('[data-layer-id]').forEach(/** @param {HTMLElement} el */ (el) => {
    elMap[el.dataset.layerId] = el;
    let homeScene=MIN_SCENE_ID;for(const module of(sceneRegistry?.all()||[])){const r=module?.rootId?document.getElementById(module.rootId):null;if(r?.contains(el)){homeScene=module.id;break}}
    coreDomHomes[el.dataset.layerId]={parent:el.parentNode,next:el.nextSibling,scene:homeScene};
  });
  const characterMainLens = document.getElementById('characterMainLens');
  const characterMainLensHome=characterMainLens?{parent:characterMainLens.parentNode,next:characterMainLens.nextSibling}:null;
  const sceneControllers = Object.fromEntries(
    (sceneRegistry?.all() || []).map(module => [module.id, module.createController?.({ editMode }) || null])
  );

  let stageScale = 1;
  let stageLeft = 0;
  let stageTop = 0;
  let stageGeometryReady = false;
  let syncingBackgroundPerspectiveBinding = false;
  let alphaReady = false;
  let alphaPixels = null;
  let scrollProgress = 0;
  let saveTimer = 0;
  let lastLensActive = false;
  let editorPriorityIds = new Set();

  function textStyle(fontSize, fontWeight, letterSpacing, lineHeight = 1, color = '#ffffff', align = 'left', fontFamily = 'inherit') {
    return { fontSize, fontWeight, letterSpacing, lineHeight, color, align, fontFamily };
  }

  function defaultImageStyle() {
    return { brightness: 1, contrast: 1, saturation: 1, hue: 0 };
  }

  function imageLayer(name, role, src, width, height, x, y, scale, z, opacity=1) {
    return {
      type: 'image', scene: 1, role, core: true, name, src, width, height, sourceWidth: width, sourceHeight: height,
      x, y, scale, rotation: 0, opacity, z, visible: true, locked: false,
      imageStyle: defaultImageStyle()
    };
  }

  const DEFAULT_LAYOUT = {
    version: 35,
    siteTitle: { en: "Joe's Portfolio", zh: 'Joe 的作品集' },
    layers: Object.assign({}, ...(sceneRegistry?.all() || []).map(module => JSON.parse(JSON.stringify(module.layers || {})))),
    deletedLayers: [],
    bindings: {
      'binding-default-hero': { id: 'binding-default-hero', mode: 'absolute', name: 'Hero foreground', members: ['rock', 'characterMain', 'characterPerspective'] }
    },
    xray: {
      radius: 184,
      feather: 52,
      mainOpacity: 0,
      perspectiveOpacity: 0.50,
      bonesOpacity: 0.78,
      activationDistance: 92
      ,expansionDurationMs: 1050
    },
    digitalRain: {
      density: 1.60,
      digitSize: 1.10
    },
    // v63: both background images live in the same artboard and use a normal layer binding.
    backgroundPerspectiveBinding: null,
    transition: {
      lift: 360,
      foregroundSpeed: 1,
      backgroundSpeed: 0.5,
      bottomShade: 0.88,
      dwellRatio: 0.10
    },
    sceneTransitions: Object.fromEntries(SCENE_IDS.map(scene => [scene, scene === 1
      ? { lift:360, foregroundSpeed:1, backgroundSpeed:0.5, bottomShade:0.88, dwellRatio:0.10, crossfadeMs:300 }
      : { lift:0, foregroundSpeed:1, backgroundSpeed:0.5, bottomShade:0, dwellRatio:0, crossfadeMs:([2,3].includes(scene)?300:(scene===4?440:300)) }])),
    cinematicSettings: { pauseInertiaMs: 180 },
    background: { x:50,y:50,zoom:1,src:'',fileName:'',sourceWidth:null,sourceHeight:null },
    sceneBackgrounds: Object.fromEntries(SCENE_IDS.map(scene => [scene, scene === 1
      ? {x:50,y:50,zoom:1,src:'',fileName:'',sourceWidth:null,sourceHeight:null}
      : {x:50,y:50,zoom:1,src:'',fileName:'',sourceWidth:null,sourceHeight:null}])),
    sceneVisibility:Object.fromEntries(SCENE_IDS.map(scene=>[scene,true])),
    sceneShades: Object.fromEntries(SCENE_IDS.map(scene => [scene, scene === 1 ? { top:0, bottom:0.88 } : ([2,3,4].includes(scene) ? { top:0.88, bottom:0.88 } : { top:0, bottom:0 })]))
  };

  function coalesceTextLayers(targetLayout) {
    const layers = targetLayout?.layers || {};
    const byScene = new Map();
    for (const layer of Object.values(layers)) {
      if (layer?.type !== 'text') continue;
      const scene = validSceneId(layer.scene, MIN_SCENE_ID);
      if (!byScene.has(scene)) byScene.set(scene, []);
      byScene.get(scene).push(layer);
    }
    for (const group of byScene.values()) {
      if (group.length < 2) continue;
      const textZ = Math.max(...group.map(layer => Number(layer.z) || 0));
      group.forEach(layer => { layer.z = textZ; });
    }
    return targetLayout;
  }

  function cloneDefault() { return coalesceTextLayers(JSON.parse(JSON.stringify(DEFAULT_LAYOUT))); }

  const BUILTIN_ASSET_MIGRATIONS = {
    'assets/bg-night.png':'scenes/scene-1/assets/bg-night.png','assets/character-main.png':'scenes/scene-1/assets/character-main.png','assets/character-perspective.png':'scenes/scene-1/assets/character-perspective.png','assets/character-bones.png':'scenes/scene-1/assets/character-bones.png','assets/rock.png':'scenes/scene-1/assets/rock.png','assets/scene2-glasses.mp4':'scenes/scene-2/assets/scene2-glasses.mp4','assets/scene2-poster.jpg':'scenes/scene-2/assets/scene2-poster.jpg','scenes/scene-2/assets/scene2-pen.mp4':'scenes/scene-3/assets/scene3-pen.mp4','scenes/scene-3/assets/scene3-glasses.mp4':'scenes/scene-2/assets/scene2-glasses.mp4'
  };

  function migrateBuiltInAssetPath(src) { return BUILTIN_ASSET_MIGRATIONS[src] || src; }

  function migrateInsertedScene2Layout(candidate) {
    if (!candidate || typeof candidate !== 'object' || Number(candidate.version || 0) >= 18) return candidate;
    const migrated = JSON.parse(JSON.stringify(candidate));
    const nextLayers = {};
    for (const [id, original] of Object.entries(migrated.layers || {})) {
      const layer = { ...original };
      let nextId = id;
      const oldScene = Math.max(1, Number(layer.scene || 1) || 1);
      if (oldScene >= 2) layer.scene = oldScene + 1;
      if (id === 'scene2Video') {
        nextId = 'scene3Video';
        layer.name = String(layer.name || 'Scene 3 video').replace('Scene 2', 'Scene 3');
        layer.src = String(layer.src || '').replace('scenes/scene-2/assets/scene2-glasses.mp4', 'scenes/scene-3/assets/scene3-glasses.mp4');
        layer.poster = String(layer.poster || '').replace('scenes/scene-2/assets/scene2-poster.jpg', 'scenes/scene-3/assets/scene3-poster.jpg');
      }
      nextLayers[nextId] = layer;
    }
    migrated.layers = nextLayers;
    if (Array.isArray(migrated.deletedLayers)) {
      migrated.deletedLayers = migrated.deletedLayers.map(id => id === 'scene2Video' ? 'scene3Video' : id);
    }
    if (migrated.bindings && typeof migrated.bindings === 'object') {
      for (const binding of Object.values(migrated.bindings)) {
        if (!Array.isArray(binding?.members)) continue;
        binding.members = binding.members.map(id => id === 'scene2Video' ? 'scene3Video' : id);
      }
    }
    const oldShades = migrated.sceneShades || {};
    const s1 = oldShades[1] || oldShades['1'] || { top:0, bottom:Number(migrated.transition?.bottomShade ?? 0.88) };
    const s2 = oldShades[2] || oldShades['2'] || { top:Number(s1.bottom ?? 0.88), bottom:Number(s1.bottom ?? 0.88) };
    const s3 = oldShades[3] || oldShades['3'] || { top:0, bottom:0 };
    migrated.sceneShades = { 1:{...s1}, 2:{...s2}, 3:{...s2}, 4:{...s3} };
    migrated.version = 18;
    return migrated;
  }

  function migrateSceneSwapAndSceneZero(candidate){
    if(!candidate||typeof candidate!=='object'||Number(candidate.version||0)>=19)return candidate;
    const migrated=JSON.parse(JSON.stringify(candidate)),nextLayers={},swapId=id=>id==='scene2Video'?'scene3Video':(id==='scene3Video'?'scene2Video':id);
    for(const [id,original] of Object.entries(migrated.layers||{})){const layer={...original},nextId=swapId(id),scene=Number(layer.scene||1);if(scene===2)layer.scene=3;else if(scene===3)layer.scene=2;if(id==='scene2Video'){layer.name='Scene 3 video';layer.src='scenes/scene-3/assets/scene3-pen.mp4';layer.poster='scenes/scene-3/assets/scene3-poster.jpg'}else if(id==='scene3Video'){layer.name='Scene 2 video';layer.src='scenes/scene-2/assets/scene2-glasses.mp4';layer.poster='scenes/scene-2/assets/scene2-poster.jpg'}nextLayers[nextId]=layer}migrated.layers=nextLayers;
    if(Array.isArray(migrated.deletedLayers))migrated.deletedLayers=migrated.deletedLayers.map(swapId);if(migrated.bindings&&typeof migrated.bindings==='object')for(const binding of Object.values(migrated.bindings)){if(Array.isArray(binding?.members))binding.members=binding.members.map(swapId)}
    if(migrated.sceneShades&&typeof migrated.sceneShades==='object'){const shades=JSON.parse(JSON.stringify(migrated.sceneShades)),s2=shades[2]||shades['2'],s3=shades[3]||shades['3'];if(s3)migrated.sceneShades[2]=s3;if(s2)migrated.sceneShades[3]=s2}migrated.version=19;return migrated;
  }
  function migrateRemovedOpeningScene(candidate){
    if(!candidate||typeof candidate!=='object'||Number(candidate.version||0)>=24)return candidate;
    const migrated=JSON.parse(JSON.stringify(candidate));
    if(migrated.layers&&typeof migrated.layers==='object'){for(const [id,layer] of Object.entries(migrated.layers)){if(Number(layer?.scene)===0)delete migrated.layers[id]}}
    for(const key of ['sceneBackgrounds','sceneVisibility','sceneShades','sceneTransitions']){if(migrated[key]&&typeof migrated[key]==='object'){delete migrated[key][0];delete migrated[key]['0']}}
    migrated.version=24;return migrated;
  }
  function migrateScene4And4K(candidate){
    if(!candidate||typeof candidate!=='object'||Number(candidate.version||0)>=25)return candidate;
    const migrated=JSON.parse(JSON.stringify(candidate));
    if(migrated.layers?.scene3Video){
      Object.assign(migrated.layers.scene3Video,{src:'scenes/scene-3/assets/scene3-pen.mp4',poster:'scenes/scene-3/assets/scene3-poster.png',sourceWidth:3840,sourceHeight:2160});
    }
    if(!migrated.sceneTransitions||typeof migrated.sceneTransitions!=='object')migrated.sceneTransitions={};
    if(!migrated.sceneTransitions[4]&&!migrated.sceneTransitions['4'])migrated.sceneTransitions[4]={lift:0,foregroundSpeed:1,backgroundSpeed:0.5,bottomShade:0,dwellRatio:0};
    if(!migrated.sceneVisibility||typeof migrated.sceneVisibility!=='object')migrated.sceneVisibility={};
    if(migrated.sceneVisibility[4]===undefined&&migrated.sceneVisibility['4']===undefined)migrated.sceneVisibility[4]=true;
    if(!migrated.sceneShades||typeof migrated.sceneShades!=='object')migrated.sceneShades={};
    if(!migrated.sceneShades[4]&&!migrated.sceneShades['4']){
      const source=migrated.sceneShades[3]||migrated.sceneShades['3']||{top:.88,bottom:.88};
      migrated.sceneShades[4]={...source};
    }
    migrated.version=25;
    return migrated;
  }
  function migrateScene5(candidate){
    if(!candidate||typeof candidate!=='object'||Number(candidate.version||0)>=26)return candidate;
    const migrated=JSON.parse(JSON.stringify(candidate));
    if(!migrated.sceneTransitions||typeof migrated.sceneTransitions!=='object')migrated.sceneTransitions={};
    if(!migrated.sceneTransitions[5]&&!migrated.sceneTransitions['5'])migrated.sceneTransitions[5]={lift:0,foregroundSpeed:1,backgroundSpeed:0.5,bottomShade:0,dwellRatio:0};
    if(!migrated.sceneVisibility||typeof migrated.sceneVisibility!=='object')migrated.sceneVisibility={};
    if(migrated.sceneVisibility[5]===undefined&&migrated.sceneVisibility['5']===undefined)migrated.sceneVisibility[5]=true;
    if(!migrated.sceneShades||typeof migrated.sceneShades!=='object')migrated.sceneShades={};
    if(!migrated.sceneShades[5]&&!migrated.sceneShades['5'])migrated.sceneShades[5]={top:0,bottom:0};
    if(!migrated.sceneBackgrounds||typeof migrated.sceneBackgrounds!=='object')migrated.sceneBackgrounds={};
    if(!migrated.sceneBackgrounds[5]&&!migrated.sceneBackgrounds['5'])migrated.sceneBackgrounds[5]={x:50,y:50,zoom:1,src:'',fileName:'',sourceWidth:null,sourceHeight:null};
    migrated.version=26;
    return migrated;
  }

  function normaliseBackgroundState(candidate,fallback={}){const source=candidate&&typeof candidate==='object'?candidate:{},out={...fallback,...source};out.x=Math.max(0,Math.min(100,Number(out.x)||50));out.y=Math.max(0,Math.min(100,Number(out.y)||50));out.zoom=Math.max(1,Math.min(4,Number(out.zoom)||1));out.src=migrateBuiltInAssetPath(String(out.src||''));out.fileName=String(out.fileName||'');const sw=Number(out.sourceWidth),sh=Number(out.sourceHeight);out.sourceWidth=Number.isFinite(sw)&&sw>0?sw:null;out.sourceHeight=Number.isFinite(sh)&&sh>0?sh:null;return out}
  function normaliseSceneBackgrounds(candidate,legacyScene1=null){const defaults=cloneDefault().sceneBackgrounds||{},out={};for(const scene of SCENE_IDS){const source=candidate&&typeof candidate==='object'?(candidate[scene]||candidate[String(scene)]||null):null,fallback=scene===1&&legacyScene1?{...defaults[scene],...legacyScene1}:(defaults[scene]||{x:50,y:50,zoom:1,src:'',fileName:'',sourceWidth:null,sourceHeight:null});out[scene]=normaliseBackgroundState(source,fallback)}return out}
  function normaliseSceneVisibility(candidate){const out={};for(const scene of SCENE_IDS){const value=candidate&&typeof candidate==='object'?(candidate[scene]??candidate[String(scene)]):undefined;out[scene]=value!==false}return out}

  function normaliseSceneShades(candidate, scene1Bottom = 0.88) {
    const out = {};
    for (const scene of SCENE_IDS) {
      const fallback = scene === 1 ? {top:0,bottom:Number(scene1Bottom)||0.88} : ([2,3,4].includes(scene) ? {top:Number(scene1Bottom)||0.88,bottom:Number(scene1Bottom)||0.88} : {top:0,bottom:0});
      const source = candidate && typeof candidate === 'object' ? (candidate[scene] || candidate[String(scene)] || {}) : {};
      out[scene] = {top:Math.max(0,Math.min(1,Number(source.top ?? fallback.top)||0)),bottom:Math.max(0,Math.min(1,Number(source.bottom ?? fallback.bottom)||0))};
    }
    return out;
  }

  function migrateV40Crossfades(candidate){
    if(!candidate||typeof candidate!=='object'||Number(candidate.version||0)>=27)return candidate;
    const migrated=JSON.parse(JSON.stringify(candidate));
    if(!migrated.sceneTransitions||typeof migrated.sceneTransitions!=='object')migrated.sceneTransitions={};
    for(const scene of [2,3]){
      const current=migrated.sceneTransitions[scene]||migrated.sceneTransitions[String(scene)]||{lift:0,foregroundSpeed:1,backgroundSpeed:0.5,bottomShade:0,dwellRatio:0};
      migrated.sceneTransitions[scene]={...current,crossfadeMs:Number.isFinite(Number(current.crossfadeMs))?Number(current.crossfadeMs):300};
    }
    const s4=migrated.sceneTransitions[4]||migrated.sceneTransitions['4']||{lift:0,foregroundSpeed:1,backgroundSpeed:0.5,bottomShade:0,dwellRatio:0};
    migrated.sceneTransitions[4]={...s4,crossfadeMs:Number.isFinite(Number(s4.crossfadeMs))?Number(s4.crossfadeMs):440};
    migrated.version=27;
    return migrated;
  }

  function normaliseSceneTransitions(candidate, legacyTransition = null) {
    const out = {};
    for (const scene of SCENE_IDS) {
      const fallback = scene === 1 ? {...(legacyTransition || DEFAULT_LAYOUT.transition),crossfadeMs:300} : {lift:0,foregroundSpeed:1,backgroundSpeed:0.5,bottomShade:0,dwellRatio:0,crossfadeMs:([2,3].includes(Number(scene))?300:(Number(scene)===4?440:300))};
      const source = candidate && typeof candidate === 'object' ? (candidate[scene] || candidate[String(scene)] || {}) : {};
      out[scene] = {
        lift:Math.max(0,Math.min(2400,Number(source.lift ?? fallback.lift)||0)),
        foregroundSpeed:Math.max(0,Math.min(4,Number(source.foregroundSpeed ?? fallback.foregroundSpeed)||0)),
        backgroundSpeed:Math.max(0,Math.min(4,Number(source.backgroundSpeed ?? fallback.backgroundSpeed)||0)),
        bottomShade:Math.max(0,Math.min(1,Number(source.bottomShade ?? fallback.bottomShade)||0)),
        dwellRatio:[2,3,4,5].includes(Number(scene)) ? 0 : Math.max(0,Math.min(3,Number(source.dwellRatio ?? fallback.dwellRatio ?? 0.10)||0)),
        crossfadeMs:Math.max(0,Math.min(3000,Number(source.crossfadeMs ?? fallback.crossfadeMs ?? 300)||0))
      };
    }
    return out;
  }

  function normaliseLayer(id, candidate, base = null) {
    const type = candidate?.type || base?.type || 'image';
    const inferredDisplayGroup = (() => {
      const role = String(candidate?.role ?? base?.role ?? '').toLowerCase();
      const name = String(candidate?.name ?? base?.name ?? id).toLowerCase();
      return role.includes('perspective') || role.includes('xray') || name.includes('perspective') || Boolean(candidate?.xrayLayer ?? base?.xrayLayer) ? 'digital' : 'reality';
    })();
    const common = {
      type,
      scene: validSceneId(candidate?.scene ?? base?.scene ?? MIN_SCENE_ID, MIN_SCENE_ID),
      role: candidate?.role ?? base?.role ?? '',
      core: Boolean(candidate?.core ?? base?.core ?? false),
      name: String(candidate?.name ?? base?.name ?? id),
      x: Number(candidate?.x ?? base?.x ?? 500),
      y: Number(candidate?.y ?? base?.y ?? 400),
      scale: Number(candidate?.scale ?? base?.scale ?? 1),
      rotation: Number(candidate?.rotation ?? base?.rotation ?? 0),
      opacity: Number(candidate?.opacity ?? base?.opacity ?? 1),
      z: Number(candidate?.z ?? base?.z ?? 80),
      visible: candidate?.visible !== false,
      locked: Boolean(candidate?.locked ?? base?.locked ?? false),
      flow: Boolean(candidate?.flow ?? base?.flow ?? false),
      localized: Boolean(candidate?.localized ?? base?.localized ?? (candidate?.text && typeof candidate.text === 'object') ?? false)
      ,displayGroup: String(candidate?.displayGroup ?? base?.displayGroup ?? inferredDisplayGroup) || inferredDisplayGroup
    };
    if (type === 'text') {
      const fallbackStyle = base?.textStyle || (common.flow
        ? { fontSize: null, fontWeight: null, letterSpacing: null, lineHeight: null, color: null, align: null, fontFamily: 'inherit' }
        : textStyle(64, 700, -1.5, 1));
      const baseMap = base?.text && typeof base.text === 'object' ? base.text : (base?.texts || {});
      const candidateMap = candidate?.text && typeof candidate.text === 'object' ? candidate.text : (candidate?.texts || {});
      const scalarBase = typeof base?.text === 'string' ? base.text : '';
      const scalarCandidate = typeof candidate?.text === 'string' ? candidate.text : '';
      common.texts = { ...baseMap, ...candidateMap };
      common.localized = Boolean(common.localized || Object.keys(common.texts).length);
      common.text = String(scalarCandidate || common.texts.en || scalarBase || candidate?.name || base?.name || 'Text');
      if (common.localized) {
        if (!common.texts.en) common.texts.en = common.text;
        if (!common.texts.zh) common.texts.zh = common.texts.en;
      }
      common.textStyle = { ...fallbackStyle, ...(candidate?.textStyle || {}) };
      if (!common.textStyle.fontFamily) common.textStyle.fontFamily = 'inherit';
      const widthCandidate = candidate?.boxWidth ?? base?.boxWidth ?? null;
      common.boxWidth = Number.isFinite(Number(widthCandidate)) && Number(widthCandidate) > 0 ? Number(widthCandidate) : null;
      const hasExplicitLink = Boolean(candidate && Object.prototype.hasOwnProperty.call(candidate, 'link'));
      const link = hasExplicitLink ? candidate.link : (base?.link ?? null);
      common.link = link && typeof link === 'object' ? {
        href: String(link.href || ''),
        target: link.target === '_blank' ? '_blank' : '_self',
        offset: Math.max(-1000, Math.min(1000, Number(link.offset || 0)))
      } : null;
      const timing = candidate?.displayTiming ?? base?.displayTiming ?? {};
      common.displayTiming = {
        enterDelayMs: Math.max(0, Math.min(60000, Number(timing?.enterDelayMs) || 0)),
        visibleForMs: Math.max(0, Math.min(600000, Number(timing?.visibleForMs) || 0))
      };
    }
    if (type === 'image') {
      common.src = migrateBuiltInAssetPath(String(candidate?.src ?? base?.src ?? ''));
      common.assetId = String(candidate?.assetId ?? base?.assetId ?? '');
      common.fileName = String(candidate?.fileName ?? base?.fileName ?? '');
      common.width = Math.max(1, Number(candidate?.width ?? base?.width ?? 300) || 300);
      common.height = Math.max(1, Number(candidate?.height ?? base?.height ?? 300) || 300);
      const sourceWidth = Number(candidate?.sourceWidth ?? base?.sourceWidth);
      const sourceHeight = Number(candidate?.sourceHeight ?? base?.sourceHeight);
      common.sourceWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : null;
      common.sourceHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : null;
      common.imageStyle = {
        ...defaultImageStyle(),
        ...(base?.imageStyle || {}),
        ...(candidate?.imageStyle || {})
      };
      common.imageStyle.brightness = Number(common.imageStyle.brightness ?? 1);
      common.imageStyle.contrast = Number(common.imageStyle.contrast ?? 1);
      common.imageStyle.saturation = Number(common.imageStyle.saturation ?? 1);
      common.imageStyle.hue = Number(common.imageStyle.hue ?? 0);
      common.xrayLayer = Boolean(candidate?.xrayLayer ?? base?.xrayLayer ?? false);
      common.xrayPairOf = String(candidate?.xrayPairOf ?? base?.xrayPairOf ?? '');
    }
    if (type === 'video') {
      common.src = migrateBuiltInAssetPath(String(candidate?.src ?? base?.src ?? ''));
      common.poster = migrateBuiltInAssetPath(String(candidate?.poster ?? base?.poster ?? ''));
      common.fileName = String(candidate?.fileName ?? base?.fileName ?? '');
      common.width = Math.max(1, Number(candidate?.width ?? base?.width ?? 1920) || 1920);
      common.height = Math.max(1, Number(candidate?.height ?? base?.height ?? 1080) || 1080);
      const sourceWidth = Number(candidate?.sourceWidth ?? base?.sourceWidth);
      const sourceHeight = Number(candidate?.sourceHeight ?? base?.sourceHeight);
      common.sourceWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : null;
      common.sourceHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : null;
      common.fit = ['cover','contain','fill'].includes(candidate?.fit) ? candidate.fit : (base?.fit || 'cover');
      common.playbackRate = Math.max(0.25, Math.min(3, Number(candidate?.playbackRate ?? base?.playbackRate ?? 1) || 1));
    }
    return common;
  }

  function normaliseBindings(candidate, layers) {
    const out = {};
    if (!candidate || typeof candidate !== 'object') return out;
    for (const [id, binding] of Object.entries(candidate)) {
      const members = [...new Set((binding?.members || []).filter(member => layers[member]))];
      if (members.length < 2) continue;
      out[id] = { id, mode: 'absolute', name: String(binding?.name || 'Binding'), members };
    }
    return out;
  }

  function normaliseCinematicSettings(candidate) {
    const source = candidate && typeof candidate === 'object' ? candidate : {};
    return {
      pauseInertiaMs: Math.max(0, Math.min(1200, Number(source.pauseInertiaMs ?? DEFAULT_LAYOUT.cinematicSettings.pauseInertiaMs) || 0))
    };
  }

  /** @param {LayoutCandidate|unknown} candidate @returns {Layout} */
  function normaliseLayout(candidate) {
    candidate = migrateInsertedScene2Layout(candidate);
    candidate = migrateSceneSwapAndSceneZero(candidate);
    candidate = migrateRemovedOpeningScene(candidate);
    candidate = migrateScene4And4K(candidate);
    candidate = migrateScene5(candidate);
    candidate = migrateV40Crossfades(candidate);
    const out = cloneDefault();
    if (!candidate || typeof candidate !== 'object') { compactLayerDepths(out); return out; }
    /** @type {LayoutCandidate} */
    const source = /** @type {LayoutCandidate} */ (candidate);

    const sourceLayers = source.layers && typeof source.layers === 'object' ? source.layers : {};

    // Migration from v5: the body/x-ray were one Character group. Keep the
    // user's carefully adjusted transform as the starting transform for all
    // three independent character layers.
    if (sourceLayers.character && !sourceLayers.characterMain) {
      const legacy = sourceLayers.character;
      for (const [id, zOffset] of [['characterMain', 0], ['characterPerspective', 2], ['characterBones', 3]]) {
        const base = out.layers[id];
        out.layers[id] = normaliseLayer(id, { ...base, ...legacy, type: 'image', role: base.role, src: base.src, width: 941, height: 1672, z: Number(legacy.z ?? base.z) + Number(zOffset) }, base);
      }
    }

    for (const [id, layer] of Object.entries(sourceLayers)) {
      if (id === 'character') continue;
      const explicitScene = Number(layer?.scene);
      // A previous build may still exist in localStorage. Never fold layers from
      // deleted scenes into Scene 1 when the current manifest only contains the active scene set.
      if (Number.isFinite(explicitScene) && !SCENE_IDS.includes(explicitScene)) continue;
      const base = out.layers[id] || null;
      out.layers[id] = normaliseLayer(id, layer, base);
    }

    const deletedLayers = Array.isArray(source.deletedLayers)
      ? [...new Set(source.deletedLayers.map(String))].filter(id => Boolean(DEFAULT_LAYOUT.layers[id]))
      : [];
    out.deletedLayers = deletedLayers;
    deletedLayers.forEach(id => { delete out.layers[id]; });

    if (source.siteTitle && typeof source.siteTitle === 'object') {
      out.siteTitle = {
        en: String(source.siteTitle.en ?? out.siteTitle.en ?? "Joe's Portfolio"),
        zh: String(source.siteTitle.zh ?? out.siteTitle.zh ?? 'Joe 的作品集')
      };
    }
    const legacyBackground=source.background&&typeof source.background==='object'?source.background:out.background;
    out.sceneBackgrounds=normaliseSceneBackgrounds(source.sceneBackgrounds,legacyBackground);out.background={...out.sceneBackgrounds[1]};out.sceneVisibility=normaliseSceneVisibility(source.sceneVisibility);
    if (out.layers.scene1Background) {
      out.sceneBackgrounds[1] = {x:50,y:50,zoom:1,src:'',fileName:'',sourceWidth:null,sourceHeight:null};
      out.background = {...out.sceneBackgrounds[1]};
      out.backgroundPerspectiveBinding = null;
    }
    if (source.xray) Object.assign(out.xray, source.xray);
    out.xray.expansionDurationMs = Math.max(200, Math.min(5000, Number(out.xray.expansionDurationMs) || 1050));
    const rainCandidate = source.digitalRain && typeof source.digitalRain === 'object' ? source.digitalRain : {};
    out.digitalRain = {
      density: Math.max(0.5, Math.min(2.5, Number(rainCandidate.density ?? out.digitalRain?.density ?? 1.60) || 1.60)),
      digitSize: Math.max(0.55, Math.min(1.8, Number(rainCandidate.digitSize ?? out.digitalRain?.digitSize ?? 1.10) || 1.10))
    };
    const perspectiveBinding = out.layers.scene1Background ? null : (source.backgroundPerspectiveBinding && typeof source.backgroundPerspectiveBinding === 'object'
      ? source.backgroundPerspectiveBinding
      : out.backgroundPerspectiveBinding);
    if (perspectiveBinding && perspectiveBinding.enabled !== false) {
      out.backgroundPerspectiveBinding = {
        enabled: true,
        offsetX: Number(perspectiveBinding.offsetX ?? 0) || 0,
        offsetY: Number(perspectiveBinding.offsetY ?? 0) || 0,
        scaleRatio: Math.max(0.0001, Number(perspectiveBinding.scaleRatio ?? 1) || 1)
      };
    } else {
      out.backgroundPerspectiveBinding = null;
    }
    // The duplicated normal-body lens caused cross-browser ghost copies.
    // Keep the public X-ray as a true cut-away: normal body hole + perspective + bones.
    out.xray.mainOpacity = 0;
    if (source.transition) Object.assign(out.transition, source.transition);
    out.sceneTransitions = normaliseSceneTransitions(source.sceneTransitions, out.transition);
    out.transition = { ...out.sceneTransitions[1] };
    out.cinematicSettings = normaliseCinematicSettings(source.cinematicSettings);
    out.sceneShades = normaliseSceneShades(source.sceneShades, Number(out.sceneTransitions[1]?.bottomShade ?? 0.88));

    if (source.bindings && typeof source.bindings === 'object') {
      const bindings = JSON.parse(JSON.stringify(source.bindings));
      for (const binding of Object.values(bindings)) {
        if (!Array.isArray(binding?.members) || !binding.members.includes('character')) continue;
        binding.members = binding.members.flatMap(id => id === 'character' ? ['characterMain', 'characterPerspective', 'characterBones'] : [id]);
      }
      const migratedBindings = normaliseBindings(bindings, out.layers);
      out.bindings = Object.keys(migratedBindings).length || Number(source.version || 0) >= 6
        ? migratedBindings
        : cloneDefault().bindings;
    }
    if (Number(source.version || 0) < 23) coalesceTextLayers(out);
    out.version = 35;
    compactLayerDepths(out);
    return out;
  }

  function compactLayoutForStorage(source = layout) {
    const copy = JSON.parse(JSON.stringify(source || {}));
    for (const [id, layer] of Object.entries(copy.layers || {})) {
      if (layer?.type !== 'text') continue;
      if (layer.localized || (layer.texts && Object.keys(layer.texts).length)) {
        const en = String(layer.texts?.en ?? (typeof layer.text === 'string' ? layer.text : '') ?? '');
        const zh = String(layer.texts?.zh ?? en);
        layer.text = { en, zh };
        delete layer.texts;
        delete layer.localized;
      }
      if (!layer.link || !String(layer.link.href || '').trim()) {
        if (DEFAULT_LAYOUT.layers?.[id]?.link) layer.link = null;
        else delete layer.link;
      } else {
        layer.link.href = String(layer.link.href || '').trim();
        if (layer.link.target !== '_blank') delete layer.link.target;
        if (!Number(layer.link.offset || 0)) delete layer.link.offset;
      }
    }
    return copy;
  }

  /** @returns {Layout} */
  function loadLayout() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normaliseLayout(JSON.parse(raw)) : normaliseLayout(cloneDefault());
    } catch (_) {
      return normaliseLayout(cloneDefault());
    }
  }

  layout = loadLayout();

  async function saveLayoutToServer() {
    if (!editMode) return { ok: true, skipped: true };
    const res = await fetch(API_LAYOUT + '?draft=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: compactLayoutForStorage(layout) })
    });
    if (!res.ok) throw new Error('Could not save data/layout02.json');
    return res.json();
  }

  function debounceServerSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveLayoutToServer().catch(() => {}); }, 140);
  }

  function persistLayout() {
    // localStorage is an instant cache only. In edit mode every persistent
    // mutation goes to layout02.json; layout01.json remains immutable until Save.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
    if (editMode) debounceServerSave();
  }

  function cancelPendingSave() {
    clearTimeout(saveTimer);
  }

  async function flushLayout() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
    return saveLayoutToServer();
  }

  async function ensureServerVersion() {
    let res;
    try {
      res = await fetch(API_VERSION + '?t=' + Date.now(), { cache: 'no-store' });
    } catch (_) {
      throw new Error('Server is not reachable. Restart this project with start.command.');
    }
    const payload = await res.json().catch(() => ({}));
    const version = Number(payload?.version || 0);
    if (!res.ok || !payload?.ok || !payload?.editSessionApi || version < REQUIRED_SERVER_VERSION) {
      throw new Error('The page is newer than the running server. Close the old server window and restart this project with start.command.');
    }
    return payload;
  }

  async function editSessionAction(action) {
    await ensureServerVersion();
    const res = await fetch(API_EDIT_SESSION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || !payload?.ok) {
      if (res.status === 404) {
        throw new Error('The running server is outdated. Restart this project with start.command.');
      }
      throw new Error(payload?.error || `Edit session ${action} failed`);
    }
    return payload;
  }

  async function commitEditSession() {
    if (!editMode) return { ok: true, layout };
    cancelPendingSave();
    await flushLayout();
    const payload = await editSessionAction('save');
    if (payload?.layout) {
      layout = normaliseLayout(payload.layout);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
    }
    try { sessionStorage.removeItem(EDIT_SESSION_KEY); } catch (_) {}
    return payload;
  }

  async function discardEditSession() {
    if (!editMode) return { ok: true, layout };
    cancelPendingSave();
    const payload = await editSessionAction('discard');
    if (payload?.layout) {
      layout = normaliseLayout(payload.layout);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
      applyLayout();
    }
    try { sessionStorage.removeItem(EDIT_SESSION_KEY); } catch (_) {}
    return payload;
  }

  async function hydrateFromServer() {
    try {
      if (editMode) {
        let continuing = false;
        try { continuing = sessionStorage.getItem(EDIT_SESSION_KEY) === '1'; } catch (_) {}
        if (!continuing) {
          const status = await editSessionAction('status');
          let action = 'begin';
          if (status?.draftDiffers) {
            const message = uiLanguage === 'zh'
              ? '上次编辑可能意外关闭，检测到尚未保存的草稿。是否继续上次草稿？\n\n选择“确定”：继续 layout02 草稿。\n选择“取消”：放弃草稿，用 layout01 覆盖 layout02 后重新编辑。'
              : 'The previous edit may have closed unexpectedly and an unsaved draft was found. Continue the previous draft?\n\nOK: continue layout02.\nCancel: discard it, copy layout01 over layout02, and start a new draft.';
            action = window.confirm(message) ? 'resume' : 'restart';
          }
          const begun = await editSessionAction(action);
          if (begun?.layout) {
            layout = normaliseLayout(begun.layout);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
            applyLayout();
          }
          try { sessionStorage.setItem(EDIT_SESSION_KEY, '1'); } catch (_) {}
          return;
        }
      }
      const layoutUrl = API_LAYOUT + ((editMode || previewMode) ? '?draft=1&t=' : '?t=') + Date.now();
      const res = await fetch(layoutUrl, { cache: 'no-store' });
      if (!res.ok) {
        // Production is a static deployment without server.py. Fall back to
        // the committed layout file so the showcase matches the saved editor
        // state instead of silently rendering only built-in defaults.
        if (!editMode && !previewMode) {
          const staticRes = await fetch('data/layout01.json', { cache: 'no-cache' });
          if (staticRes.ok) {
            const staticLayout = await staticRes.json();
            layout = normaliseLayout(staticLayout);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
            applyLayout();
          }
        }
        return;
      }
      const payload = await res.json();
      if (payload?.layout) {
        layout = normaliseLayout(payload.layout);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(compactLayoutForStorage(layout))); } catch (_) {}
        applyLayout();
        return;
      }
      // First run of this version: migrate the existing localhost layout from
      // the previous browser-only version into the project file.
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        layout = normaliseLayout(JSON.parse(cached));
        applyLayout();
        await migrateLegacyIndexedDbAssets();
        await flushLayout();
      }
    } catch (_) {}
  }

  function ensureSceneBackgroundElement(scene){if(Number(scene)===1)return backgroundImage;if(sceneBackgroundEls[scene]?.isConnected)return sceneBackgroundEls[scene];const module=sceneRegistry?.get(Number(scene)),sceneRoot=module?.rootId?document.getElementById(module.rootId):null;if(!sceneRoot)return null;const host=ensureSceneHoldElement(scene)||sceneRoot;let wrapper=host.querySelector(':scope > .scene-managed-background');if(!wrapper){wrapper=document.createElement('div');wrapper.className='scene-managed-background';wrapper.setAttribute('aria-hidden','true');const img=document.createElement('img');img.alt='';img.draggable=false;wrapper.appendChild(img);host.insertBefore(wrapper,host.firstChild)}const img=wrapper.querySelector('img');sceneBackgroundEls[scene]=img;return img}
  function backgroundForScene(scene){const id=validSceneId(scene,MIN_SCENE_ID);if(!layout.sceneBackgrounds||typeof layout.sceneBackgrounds!=='object')layout.sceneBackgrounds=normaliseSceneBackgrounds(null,layout.background);if(!layout.sceneBackgrounds[id])layout.sceneBackgrounds[id]=normaliseBackgroundState(null,cloneDefault().sceneBackgrounds?.[id]||{});return layout.sceneBackgrounds[id]}
  function applyBackground(){for(const scene of SCENE_IDS){const bg=backgroundForScene(scene),img=ensureSceneBackgroundElement(scene);if(!img)continue;const isSceneOne=Number(scene)===1,wrapper=isSceneOne?img.closest('.viewport-background'):img.closest('.scene-managed-background'),src=isSceneOne?String(bg.src||''):'';if(src&&img.getAttribute('src')!==src)img.setAttribute('src',src);if(!src)img.removeAttribute('src');img.style.display=src?'':'none';if(wrapper){wrapper.style.display=src?'':'none';wrapper.style.setProperty('--scene-bg-x',`${bg.x}%`);wrapper.style.setProperty('--scene-bg-y',`${bg.y}%`);wrapper.style.setProperty('--scene-bg-zoom',String(bg.zoom))}if(isSceneOne){root.style.setProperty('--bg-x',`${bg.x}%`);root.style.setProperty('--bg-y',`${bg.y}%`);root.style.setProperty('--bg-zoom',String(bg.zoom));layout.background={...bg}}}}

  function sceneOneBackgroundGeometry() {
    if (!sceneOneBackgroundSurface) return null;
    const rect = sceneOneBackgroundSurface.getBoundingClientRect();
    const bg = backgroundForScene(1);
    const sourceWidth = Math.max(1, Number(bg?.sourceWidth) || Number(/** @type {HTMLImageElement} */ (backgroundImage)?.naturalWidth) || 1536);
    const sourceHeight = Math.max(1, Number(bg?.sourceHeight) || Number(/** @type {HTMLImageElement} */ (backgroundImage)?.naturalHeight) || 864);
    const width = Math.max(1, Number(rect.width) || window.innerWidth || 1);
    const height = Math.max(1, Number(rect.height) || window.innerHeight || 1);
    const coverScale = Math.max(width / sourceWidth, height / sourceHeight);
    const coverWidth = sourceWidth * coverScale;
    const coverHeight = sourceHeight * coverScale;
    const positionX = Math.max(0, Math.min(1, Number(bg?.x ?? 50) / 100));
    const positionY = Math.max(0, Math.min(1, Number(bg?.y ?? 50) / 100));
    const zoom = Math.max(0.01, Number(bg?.zoom) || 1);
    const objectLeft = (width - coverWidth) * positionX;
    const objectTop = (height - coverHeight) * positionY;
    // <img> fills the viewport and object-fit:cover paints the source inside it.
    // CSS transform scales that viewport-sized box around its centre, so reapply
    // the exact same geometry here rather than approximating with the hero stage.
    const originX = rect.left + width * 0.5 + zoom * (objectLeft - width * 0.5);
    const originY = rect.top + height * 0.5 + zoom * (objectTop - height * 0.5);
    return {
      originX,
      originY,
      sourceScale: coverScale * zoom,
      sourceWidth,
      sourceHeight,
      rect
    };
  }

  function captureBackgroundPerspectiveBinding() {
    if (layout.layers?.scene1Background) return null;
    if (!stageGeometryReady || syncingBackgroundPerspectiveBinding) return layout.backgroundPerspectiveBinding || null;
    const state = layout.layers?.backgroundPerspective;
    const bg = sceneOneBackgroundGeometry();
    if (!state || !bg || !Number.isFinite(stageScale) || stageScale <= 0 || !Number.isFinite(bg.sourceScale) || bg.sourceScale <= 0) return null;
    const perspectiveOriginX = stageLeft + Number(state.x || 0) * stageScale;
    const perspectiveOriginY = stageTop + Number(state.y || 0) * stageScale;
    const perspectiveScale = Math.max(0.000001, Math.abs(Number(state.scale) || 1) * stageScale);
    const binding = {
      enabled: true,
      offsetX: (perspectiveOriginX - bg.originX) / bg.sourceScale,
      offsetY: (perspectiveOriginY - bg.originY) / bg.sourceScale,
      scaleRatio: perspectiveScale / bg.sourceScale
    };
    layout.backgroundPerspectiveBinding = binding;
    return binding;
  }

  function applyBackgroundPerspectiveBinding({ captureIfMissing = true } = {}) {
    if (layout.layers?.scene1Background) return false;
    if (!stageGeometryReady) return false;
    const state = layout.layers?.backgroundPerspective;
    const bg = sceneOneBackgroundGeometry();
    if (!state || !bg) return false;
    let binding = layout.backgroundPerspectiveBinding;
    if ((!binding || binding.enabled === false) && captureIfMissing) binding = captureBackgroundPerspectiveBinding();
    if (!binding || binding.enabled === false) return false;
    const screenScale = Math.max(0.000001, Number(binding.scaleRatio) || 1) * bg.sourceScale;
    const screenX = bg.originX + (Number(binding.offsetX) || 0) * bg.sourceScale;
    const screenY = bg.originY + (Number(binding.offsetY) || 0) * bg.sourceScale;
    syncingBackgroundPerspectiveBinding = true;
    state.x = Number(((screenX - stageLeft) / Math.max(0.000001, stageScale)).toFixed(4));
    state.y = Number(((screenY - stageTop) / Math.max(0.000001, stageScale)).toFixed(4));
    state.scale = Number((screenScale / Math.max(0.000001, stageScale)).toFixed(6));
    syncingBackgroundPerspectiveBinding = false;
    return true;
  }
  function applySceneVisibility(){for(const module of(sceneRegistry?.all()||[])){const sceneRoot=module?.rootId?document.getElementById(module.rootId):null;if(!sceneRoot)continue;const visible=layout.sceneVisibility?.[module.id]!==false;sceneRoot.classList.toggle('scene-hidden-in-editor',editMode&&!visible);sceneRoot.style.display=!visible&&!editMode?'none':'';let badge=sceneRoot.querySelector(':scope > .scene-hidden-edit-badge');if(!badge){badge=document.createElement('div');badge.className='scene-hidden-edit-badge';badge.setAttribute('aria-hidden','true');sceneRoot.appendChild(badge)}badge.textContent=uiLanguage==='zh'?`第${Number(module.id)+1}幕已隐藏`:`Scene ${Number(module.id)+1} hidden`}}

  const sceneScrollProgress = Object.fromEntries(SCENE_IDS.map(scene => [scene, 0]));
  function sceneShadeStrength(scene, edge) {return Math.max(0,Math.min(1,Number(layout.sceneShades?.[scene]?.[edge] ?? 0)||0));}
  function transitionForScene(scene){const id=validSceneId(scene,MIN_SCENE_ID),fallback=id===1?(layout.transition||DEFAULT_LAYOUT.transition):{lift:0,foregroundSpeed:1,backgroundSpeed:0.5,bottomShade:0,dwellRatio:0};return layout.sceneTransitions?.[id]||layout.sceneTransitions?.[String(id)]||fallback;}
  function sceneProgressFor(scene){return Math.max(0,Math.min(1,Number(sceneScrollProgress[validSceneId(scene,MIN_SCENE_ID)]||0)))}
  function applySceneDwellLayout(){
    for(const scene of SCENE_IDS){
      const sceneRoot=sceneRootFor(scene);if(!sceneRoot)continue;
      const hold=ensureSceneHoldElement(scene);
      const inCinematicStack=!editMode&&[2,3,4,5].includes(Number(scene))&&Boolean(sceneRoot.closest('#cinematicStack'));

      if(Number(scene)===1){
        const dwell=editMode?0:Math.max(0,Math.min(3,Number(transitionForScene(scene)?.dwellRatio||0)));
        // Scene 1 keeps its original scroll/hero transition structure.
        sceneRoot.style.boxSizing='content-box';
        sceneRoot.style.height='';
        sceneRoot.style.minHeight='';
        sceneRoot.style.maxHeight='';
        sceneRoot.style.paddingBottom=`${(dwell*100).toFixed(3)}dvh`;
        continue;
      }

      if(inCinematicStack){
        // v37: Scenes 2–5 share one physical 100dvh stack. No scene owns a
        // dwell track and no scene can move independently of the stack.
        sceneRoot.style.boxSizing='border-box';
        sceneRoot.style.paddingBottom='0px';
        sceneRoot.style.height='100dvh';
        sceneRoot.style.minHeight='100dvh';
        sceneRoot.style.maxHeight='100dvh';
        sceneRoot.style.overflow='hidden';
        if(hold){
          hold.style.position='absolute';
          hold.style.inset='0px';
          hold.style.top='0px';
          hold.style.height='100dvh';
          hold.style.minHeight='100dvh';
          hold.style.maxHeight='100dvh';
        }
        continue;
      }

      // Edit Mode (and any non-stacked future scene) keeps a single viewport.
      const dwell=editMode?0:Math.max(0,Math.min(3,Number(transitionForScene(scene)?.dwellRatio||0)));
      sceneRoot.style.boxSizing='border-box';
      sceneRoot.style.paddingBottom='0px';
      sceneRoot.style.height=`${((1+dwell)*100).toFixed(3)}dvh`;
      sceneRoot.style.minHeight=`${((1+dwell)*100).toFixed(3)}dvh`;
      sceneRoot.style.maxHeight='';
      sceneRoot.style.overflow='visible';
      if(hold){
        hold.style.position=editMode?'relative':'sticky';
        hold.style.inset='';
        hold.style.top=editMode?'auto':'0px';
        hold.style.height='100dvh';
        hold.style.minHeight='100dvh';
        hold.style.maxHeight='100dvh';
      }
    }
  }
  function applySceneCrossfades(){
    const pairs=[[2,3],[3,4],[4,5]];
    const story=window.__joeSimpleVideoStory;
    for(const [fromScene,toScene] of pairs){
      const sceneRoot=sceneRootFor(fromScene),hold=ensureSceneHoldElement(fromScene);
      if(!sceneRoot||!hold)continue;

      // v35: Scenes 2–5 use a gesture-driven cinematic state machine. The VIDEO layer fades
      // independently so the outgoing subtitle can remain over the next
      // scene's first frame. Scroll position must therefore never fade the
      // entire sticky hold.
      if(story?.active&&story.manualCrossfades){
        hold.style.opacity='1';hold.style.transform='';hold.style.pointerEvents='';
        delete sceneRoot.dataset.crossfadeComplete;delete sceneRoot.dataset.crossfadeProgress;continue;
      }

      if(editMode||layout.sceneVisibility?.[fromScene]===false||layout.sceneVisibility?.[toScene]===false){
        hold.style.opacity='';hold.style.transform='';hold.style.pointerEvents='';
        delete sceneRoot.dataset.crossfadeComplete;delete sceneRoot.dataset.crossfadeProgress;continue;
      }
      const vh=Math.max(1,window.innerHeight),dwellPx=Math.max(0,Number(transitionForScene(fromScene)?.dwellRatio||0))*vh;
      const rect=sceneRoot.getBoundingClientRect();
      const exitPx=Math.max(0,(-rect.top)-dwellPx);
      const fadeRange=Math.max(1,vh*0.10);
      const progress=Math.max(0,Math.min(1,exitPx/fadeRange));
      const eased=smoothstep(progress);
      hold.style.opacity=(1-eased).toFixed(4);
      hold.style.transform=exitPx>0?`translate3d(0,${Math.min(exitPx,fadeRange).toFixed(2)}px,0)`:'';
      hold.style.pointerEvents=progress>=0.999?'none':'';
      sceneRoot.dataset.crossfadeProgress=progress.toFixed(4);
      sceneRoot.dataset.crossfadeComplete=progress>=0.999?'1':'0';
    }
  }
  function computeSceneProgress(scene){
    if(editMode)return 0;
    const module=sceneRegistry?.get(Number(scene)),sceneRoot=module?.rootId?document.getElementById(module.rootId):null;
    if(!sceneRoot||layout.sceneVisibility?.[scene]===false)return 0;
    if([2,3,4,5].includes(Number(scene))&&sceneRoot.closest('#cinematicStack'))return 0;
    const rect=sceneRoot.getBoundingClientRect(),vh=Math.max(1,window.innerHeight),dwellPx=Math.max(0,Number(transitionForScene(scene)?.dwellRatio||0))*vh;
    const extra=Math.max(0,sceneRoot.offsetHeight-vh),transitionRange=Math.max(1,(extra-dwellPx)>1?(extra-dwellPx):vh);
    return Math.max(0,Math.min(1,((-rect.top)-dwellPx)/transitionRange));
  }
  function applyTransitionShade(){for(const scene of SCENE_IDS){const el=sceneTransitionShadeEls[scene]||ensureSceneEffectElements(scene)?.transition;if(!el)continue;const strength=Math.max(0,Math.min(1,Number(transitionForScene(scene)?.bottomShade||0))),opacity=editMode?0:strength*smoothstep(sceneProgressFor(scene));el.style.opacity=opacity.toFixed(4);el.style.visibility=strength>0?'visible':'hidden';}}
  function applySceneShades(){for(const scene of SCENE_IDS){const els=sceneShadeEls[scene]||ensureSceneEffectElements(scene)||{},topStrength=sceneShadeStrength(scene,'top'),bottomStrength=sceneShadeStrength(scene,'bottom');if(els.top){els.top.style.opacity=topStrength.toFixed(4);els.top.style.visibility=topStrength>0?'visible':'hidden'}if(els.bottom){els.bottom.style.opacity=bottomStrength.toFixed(4);els.bottom.style.visibility=bottomStrength>0?'visible':'hidden'}}}

  function applyImageAdjustments(el, s) {
    if (!el || s?.type !== 'image') return;
    const a = { ...defaultImageStyle(), ...(s.imageStyle || {}) };
    const brightness = Math.max(0, Number(a.brightness) || 0);
    const contrast = Math.max(0, Number(a.contrast) || 0);
    const saturation = Math.max(0, Number(a.saturation) || 0);
    const hue = Number(a.hue) || 0;
    el.style.setProperty('--img-brightness', String(brightness));
    el.style.setProperty('--img-contrast', String(contrast));
    el.style.setProperty('--img-saturation', String(saturation));
    el.style.setProperty('--img-hue', `${hue}deg`);
    const neutral = Math.abs(brightness - 1) < 0.0001 && Math.abs(contrast - 1) < 0.0001 && Math.abs(saturation - 1) < 0.0001 && Math.abs(hue) < 0.0001;
    // Character perspective has its intentional glow/filter chain in CSS.
    const keepCssFilter = el.classList.contains('character-perspective') || el.classList.contains('character-bones');
    el.style.filter = neutral && !keepCssFilter ? 'none' : '';
  }

  function syncCoreLayerPresence() {
    for (const [id, el] of Object.entries(elMap)) {
      if (!el) continue;
      el.style.display = layout.layers[id] ? '' : 'none';
    }
    if (characterMainLens) { characterMainLens.style.display = 'none'; characterMainLens.style.opacity = '0'; }
  }

  function styleTextElement(el, s) {
    if (!el || s.type !== 'text') return;
    el.classList.add('runtime-text-entry');
    const t = s.textStyle || {};
    const localizedText = s.localized ? (s.texts?.[uiLanguage] ?? s.texts?.en ?? s.text ?? '') : (s.text ?? '');
    el.textContent = localizedText;
    const setOrClear = (prop, value, formatter = v => v) => {
      if (value === null || value === undefined || value === '') el.style[prop] = '';
      else el.style[prop] = formatter(value);
    };
    if (s.flow) {
      setOrClear('fontSize', t.fontSize, v => `${Number(v)}px`);
      setOrClear('fontWeight', t.fontWeight, v => String(v));
      setOrClear('letterSpacing', t.letterSpacing, v => `${Number(v)}px`);
      setOrClear('lineHeight', t.lineHeight, v => String(v));
      setOrClear('color', t.color, v => String(v));
      setOrClear('textAlign', t.align, v => String(v));
    } else {
      el.style.fontSize = `${Number(t.fontSize ?? 64)}px`;
      el.style.fontWeight = String(t.fontWeight ?? 700);
      el.style.letterSpacing = `${Number(t.letterSpacing ?? 0)}px`;
      el.style.lineHeight = String(t.lineHeight ?? 1);
      el.style.color = t.color || '#ffffff';
      el.style.textAlign = t.align || 'left';
    }
    el.style.fontFamily = !t.fontFamily || t.fontFamily === 'inherit' ? '' : t.fontFamily;
    if (Number.isFinite(Number(s.boxWidth)) && Number(s.boxWidth) > 0) {
      el.style.width = `${Number(s.boxWidth)}px`;
      el.style.maxWidth = 'none';
      el.style.whiteSpace = 'pre-wrap';
      el.style.overflowWrap = 'normal';
      el.style.wordBreak = 'normal';
    } else {
      el.style.width = '';
      el.style.maxWidth = '';
      el.style.whiteSpace = '';
      el.style.overflowWrap = '';
      el.style.wordBreak = '';
    }
    const link = s.link && String(s.link.href || '').trim() ? s.link : null;
    el.dataset.configuredHref = link?.href || '';
    el.dataset.configuredTarget = link?.target || '_self';
    el.dataset.configuredOffset = String(Number(link?.offset || 0));
    const anchor = el.closest('a');
    el.classList.toggle('has-configured-link', Boolean(link));
    if (!anchor && link && !editMode) {
      el.setAttribute('role', 'link');
      el.tabIndex = 0;
    } else if (!anchor) {
      el.removeAttribute('role');
      el.removeAttribute('tabindex');
    }
    if (anchor) {
      if (link) {
        anchor.setAttribute('href', link.href);
        anchor.setAttribute('target', link.target === '_blank' ? '_blank' : '_self');
        if (link.target === '_blank') anchor.setAttribute('rel', 'noopener noreferrer'); else anchor.removeAttribute('rel');
        anchor.dataset.scrollOffset = String(Number(link.offset || 0));
      } else {
        anchor.removeAttribute('href');
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
        delete anchor.dataset.scrollOffset;
      }
    }
  }

  function stageForScene(sceneId = MIN_SCENE_ID) {
    const module = sceneRegistry?.get(Number(sceneId));
    if (module?.stageId) return document.getElementById(module.stageId);
    if (module?.rootId) return document.getElementById(module.rootId);
    return Number(sceneId) === 1 ? stage : null;
  }

  function dynamicAnchorForScene(sceneId = MIN_SCENE_ID) {
    const scene=validSceneId(sceneId,MIN_SCENE_ID),module=sceneRegistry?.get(scene);
    if(module?.dynamicAnchorId){const existing=document.getElementById(module.dynamicAnchorId);if(existing)return existing;}
    const host=stageForScene(scene)||ensureSceneHoldElement(scene)||sceneRootFor(scene);if(!host)return null;
    let anchor=host.querySelector(':scope > .runtime-dynamic-layer-anchor');
    if(!anchor){anchor=document.createElement('div');anchor.className='dynamic-layer-anchor runtime-dynamic-layer-anchor';anchor.id=`runtimeDynamicAnchorScene${scene}`;anchor.setAttribute('aria-hidden','true');host.appendChild(anchor)}
    return anchor;
  }

  function createDynamicElement(id, s) {
    let el;
    if (s.type === 'text') {
      el = document.createElement('div');
      el.className = 'editable text-layer custom-text-layer dynamic-layer';
      styleTextElement(el, s);
    } else if (s.type === 'image') {
      el = document.createElement('img');
      el.className = 'editable custom-image-layer dynamic-layer';
      el.alt = '';
      el.draggable = false;
      el.style.width = `${s.width || 300}px`;
      el.style.height = `${s.height || 300}px`;
      el.style.objectFit = 'contain';
      el.style.objectPosition = 'center center';
      if (s.src) el.src = s.src;
      if (s.xrayLayer) el.classList.add('xray-layer', 'custom-xray-layer');
      else el.classList.remove('xray-layer', 'custom-xray-layer');
    } else if (s.type === 'video') {
      el=document.createElement('video');el.className='editable dynamic-layer';el.muted=true;el.playsInline=true;el.preload='metadata';
      el.style.width=`${s.width||1920}px`;el.style.height=`${s.height||1080}px`;el.style.objectFit=s.fit||'cover';el.playbackRate=Math.max(.25,Math.min(3,Number(s.playbackRate)||1));el.defaultPlaybackRate=el.playbackRate;if(s.src)el.src=s.src;if(s.poster)el.poster=s.poster;
    } else {
      return null;
    }
    el.dataset.layerId = id;
    const anchor = dynamicAnchorForScene(s.scene);
    if (!anchor) return null;
    anchor.before(el);
    return el;
  }

  function syncDynamicLayers() {
    const wanted = new Set(Object.entries(layout.layers).filter(([, s]) => !s.core).map(([id]) => id));
    (sceneRegistry?.all() || []).map(module => stageForScene(module.id)).filter(Boolean).forEach(sceneStage => {
      sceneStage.querySelectorAll('.dynamic-layer').forEach(/** @param {HTMLElement} el */ (el) => {
        if (!wanted.has(el.dataset.layerId)) el.remove();
      });
    });
    for (const [id, s] of Object.entries(layout.layers)) {
      if (s.core) continue;
      let el = /** @type {HTMLElement|null} */ (document.querySelector(`[data-layer-id="${CSS.escape(id)}"]`));
      const targetStage = stageForScene(s.scene);
      if (el && targetStage && !targetStage.contains(el)) { el.remove(); el = null; }
      if (!el) el = createDynamicElement(id, s);
      if (!el) continue;
      if (s.type === 'text') styleTextElement(el, s);
      if (s.type === 'image') {
        el.style.width = `${s.width || 300}px`;
        el.style.height = `${s.height || 300}px`;
        if (s.src && el.getAttribute('src') !== s.src) /** @type {HTMLImageElement} */ (el).src = s.src;
        el.classList.toggle('xray-layer', Boolean(s.xrayLayer));
        el.classList.toggle('custom-xray-layer', Boolean(s.xrayLayer));
      }
    }
  }

  function elementFor(id) {
    if (id === 'characterMain') return elMap.characterMain;
    if (id === 'characterPerspective') return elMap.characterPerspective;
    if (id === 'characterBones') return elMap.characterBones;
    return elMap[id] || document.querySelector(`[data-layer-id="${CSS.escape(id)}"]`);
  }

  function syncCoreLayerSceneParents(){
    for(const [id,state] of Object.entries(layout.layers||{})){
      if(!state?.core)continue;const el=elementFor(id);if(!el)continue;const targetScene=validSceneId(state.scene,MIN_SCENE_ID),home=coreDomHomes[id];
      if(home&&targetScene===home.scene&&home.parent?.isConnected){if(el.parentNode!==home.parent)home.parent.insertBefore(el,home.next?.isConnected?home.next:null)}
      else {const anchor=dynamicAnchorForScene(targetScene),target=stageForScene(targetScene);if(target&&!target.contains(el)){if(anchor)anchor.before(el);else target.appendChild(el)}}
      if(id==='characterMain'&&characterMainLens){if(home&&targetScene===home.scene&&characterMainLensHome?.parent?.isConnected){if(characterMainLens.parentNode!==characterMainLensHome.parent)characterMainLensHome.parent.insertBefore(characterMainLens,characterMainLensHome.next?.isConnected?characterMainLensHome.next:null)}else{const anchor=dynamicAnchorForScene(targetScene);if(anchor&&!stageForScene(targetScene)?.contains(characterMainLens))anchor.before(characterMainLens)}}
    }
  }

  function scenePointToViewport(sceneX,sceneY,sceneId=MIN_SCENE_ID){
    const scene=validSceneId(sceneId,MIN_SCENE_ID),sceneStage=stageForScene(scene);if(!sceneStage)return{x:0,y:0};const rect=sceneStage.getBoundingClientRect();
    if(scene>=5)return{x:rect.left+Number(sceneX||0),y:rect.top+Number(sceneY||0)};
    const module=sceneRegistry?.get(scene),videoLayer=Object.values(module?.layers||{}).find(layer=>layer?.type==='video'),baseW=videoLayer?Number(videoLayer.width||1920):DESIGN_W,scale=Math.max(.000001,rect.width/baseW);
    return{x:rect.left+Number(sceneX||0)*scale,y:rect.top+Number(sceneY||0)*scale};
  }

  function moveLayersToScene(ids,targetScene,viewportPlacements=null){
    const target=validSceneId(targetScene,MIN_SCENE_ID),moved=[];
    for(const id of ids||[]){
      const state=layout.layers[id];if(!state)continue;const source=sceneOfLayer(state);if(source===target)continue;
      const placement=viewportPlacements?.[id];
      const vp=placement&&Number.isFinite(Number(placement.x))&&Number.isFinite(Number(placement.y))
        ? {x:Number(placement.x),y:Number(placement.y)}
        : scenePointToViewport(state.x,state.y,source);
      const p=viewportToScene(vp.x,vp.y,target);
      state.scene=target;state.x=Number(p.x.toFixed(2));state.y=Number(p.y.toFixed(2));if(state.flow)state.flow=false;moved.push(id);
    }
    if(moved.length){compactLayerDepths(layout);syncCoreLayerSceneParents();syncDynamicLayers();applyLayout()}
    return moved;
  }

  const smoothstep = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

  function bindingForLayer(id) {
    return Object.values(layout.bindings || {}).find(binding => binding.members.includes(id)) || null;
  }

  function boundMembersFor(id) {
    const binding = bindingForLayer(id);
    return binding ? binding.members.filter(member => layout.layers[member]) : [id];
  }

  function transitionLiftFor(id) {
    if(editMode)return 0;const layer=layout.layers[id];if(!layer)return 0;const scene=validSceneId(layer.scene,MIN_SCENE_ID),t=transitionForScene(scene),progress=smoothstep(sceneProgressFor(scene));
    if ((layer.role === 'background-perspective' || layer.role === 'main-background') && scene === 1) {
      // backgroundScrollOffset is already expressed in physical CSS pixels;
      // convert it back to Scene-1 artboard units so the perspective overlay
      // tracks the photographed background exactly during the Home exit.
      return backgroundScrollOffset(1) / Math.max(0.000001, stageScale);
    }
    const foreground=Number(t.foregroundSpeed??1),speed=(scene===1&&layer.type==='text')?foreground*Number(t.backgroundSpeed??0.5):foreground;
    return -(Number(t.lift||0)*speed)*progress;
  }
  function backgroundScrollOffset(scene=1) {if(editMode)return 0;const t=transitionForScene(scene),progress=smoothstep(sceneProgressFor(scene));return -(Number(t.lift||0)*Number(t.foregroundSpeed??1)*Number(t.backgroundSpeed??0.5))*progress;}
  function firstSceneTextExitProgress(scene){
    if(Number(scene)!==MIN_SCENE_ID)return sceneProgressFor(scene);
    const direct=sceneProgressFor(scene);if(direct>0)return Math.min(1,direct*2);
    const index=SCENE_IDS.indexOf(MIN_SCENE_ID),nextId=SCENE_IDS[index+1];if(!Number.isFinite(nextId))return direct;
    const nextRoot=sceneRootFor(nextId);if(!nextRoot)return direct;
    const vh=Math.max(1,window.innerHeight),top=nextRoot.getBoundingClientRect().top;
    const entering=Math.max(0,Math.min(1,(vh-top)/vh));
    return Math.min(1,entering*2);
  }
  function videoSceneTextVisibility(scene){
    if(![2,3].includes(Number(scene)))return 1;
    const rootEl=sceneRootFor(scene);if(!rootEl)return 1;
    const vh=Math.max(1,window.innerHeight),rect=rootEl.getBoundingClientRect();
    let entry=1;
    if(Number(scene)===2){
      // Scene 2 enters vertically from below: start revealing text when half of
      // the viewport has entered, and reach full opacity when the scene is full-screen.
      entry=Math.max(0,Math.min(1,(vh*0.5-rect.top)/(vh*0.5)));
    }else{
      // Scene 3 is already layered underneath Scene 2. Its visual entry is the
      // Scene 2 crossfade, so start text reveal at the halfway point of that fade.
      const previous=sceneRootFor(2),p=Number(previous?.dataset.crossfadeProgress||0);
      entry=Math.max(0,Math.min(1,(p-0.5)/0.5));
    }
    // When this scene starts leaving, fade text immediately and make it fully
    // gone by the halfway point of the 10dvh scene crossfade.
    const exit=Number(rootEl.dataset.crossfadeProgress||0);
    const leave=Math.max(0,Math.min(1,exit*2));
    return smoothstep(entry)*(1-smoothstep(leave));
  }
  let textSceneEnteredAt = performance.now();
  function textTimingMultiplier(s) {
    if (!s?.displayTiming || !Number(s.displayTiming.enterDelayMs) && !Number(s.displayTiming.visibleForMs)) return 1;
    const scene = validSceneId(s.scene, MIN_SCENE_ID);
    if (Number(window.__joeSimpleVideoStory?.getActiveDomainId?.()) !== scene) return 0;
    const elapsed = Math.max(0, performance.now() - textSceneEnteredAt);
    const enter = Math.max(0, Number(s.displayTiming.enterDelayMs) || 0);
    const duration = Math.max(0, Number(s.displayTiming.visibleForMs) || 0);
    return elapsed < enter || (duration > 0 && elapsed >= enter + duration) ? 0 : 1;
  }
  function runtimeOpacity(id,s){
    if(editMode)return s.opacity;
    const timingMultiplier = s.type === 'text' ? textTimingMultiplier(s) : 1;
    const scene=validSceneId(s.scene,MIN_SCENE_ID);
    const story=window.__joeSimpleVideoStory;
    if(story?.active&&typeof story.getLayerOpacityMultiplier==='function'&&[2,3,4,5].includes(Number(scene))){
      return s.opacity*story.getLayerOpacityMultiplier(s)*timingMultiplier;
    }
    if(s.type==='text'&&[2,3].includes(Number(scene)))return s.opacity*videoSceneTextVisibility(scene)*timingMultiplier;
    const progress=smoothstep(s.type==='text'?firstSceneTextExitProgress(scene):sceneProgressFor(scene));
    if(s.type==='text')return s.opacity*(1-progress)*timingMultiplier;
    if(id==='scroll')return s.opacity*(1-progress);
    return s.opacity;
  }
  function startTextEntryFade(){
    if(editMode){document.documentElement.classList.add('portfolio-text-entry-started');return;}
    const rootEl=document.documentElement;
    if(rootEl.classList.contains('portfolio-text-entry-started'))return;
    rootEl.classList.add('portfolio-text-entry-running');
    const activeScene = Number(window.__joeSimpleVideoStory?.getActiveDomainId?.()) || 1;
    Object.values(layout.layers || {}).filter(layer => layer?.type === 'text' && Number(layer.scene) === activeScene)
      .flatMap(layer => [Number(layer.displayTiming?.enterDelayMs) || 0, Number(layer.displayTiming?.visibleForMs) || 0])
      .filter(delay => delay > 0)
      .forEach(delay => window.setTimeout(() => applyLayout(), delay + 8));
    // Two frames guarantee the browser paints the initial 0-opacity state
    // before releasing it to the stored runtime opacity.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      rootEl.classList.add('portfolio-text-entry-started');
      setTimeout(()=>rootEl.classList.remove('portfolio-text-entry-running'),560);
    }));
  }
  window.addEventListener('portfolio-scenes-visible',startTextEntryFade,{once:true});

  function applyTransformToElement(el, s, extraY = 0) {
    if (!el || !s) return;
    const y = s.y + extraY;
    if (s.flow) {
      el.style.position = 'relative';
      el.style.transformOrigin = 'center center';
      const isNeutral = Math.abs(Number(s.x)||0) < 0.001 && Math.abs(Number(y)||0) < 0.001 && Math.abs(Number(s.rotation)||0) < 0.001 && Math.abs((Number(s.scale)||1)-1) < 0.001;
      el.style.transform = (!editMode && isNeutral) ? '' : `translate3d(${s.x}px, ${y}px, 0) rotate(${s.rotation}deg) scale(${s.scale})`;
    } else {
      el.style.transform = `translate3d(${s.x}px, ${y}px, 0) rotate(${s.rotation}deg) scale(${s.scale})`;
    }
    el.style.zIndex = String(s.z);
    el.style.visibility = s.visible ? 'visible' : 'hidden';
    el.dataset.locked = s.locked ? '1' : '0';
  }

  function applyLayer(id) {
    const s = layout.layers[id];
    if (id === 'backgroundPerspective' && editMode && stageGeometryReady && !syncingBackgroundPerspectiveBinding) captureBackgroundPerspectiveBinding();
    if (!s) return;
    let el = elementFor(id);
    if (!el && !s.core) el = createDynamicElement(id, s);
    if (!el) return;
    if (s.type === 'text') styleTextElement(el, s);
    if (s.type === 'image') {
      el.style.width = `${s.width || el.naturalWidth || 300}px`;
      el.style.height = `${s.height || el.naturalHeight || 300}px`;
      // The image box can be stretched independently, but the default box is
      // created from the source's real dimensions so newly inserted assets do
      // not acquire an accidental vertical or horizontal distortion.
      el.style.objectFit = 'fill';
      el.style.objectPosition = 'center center';
      if (s.src && el.getAttribute('src') !== s.src) el.setAttribute('src', s.src);
      if ((!s.sourceWidth || !s.sourceHeight) && el.naturalWidth > 0 && el.naturalHeight > 0) {
        s.sourceWidth = el.naturalWidth;
        s.sourceHeight = el.naturalHeight;
      }
      applyImageAdjustments(el, s);
    }
    if (s.type === 'video') {
      el.style.width = `${s.width || 1920}px`;
      el.style.height = `${s.height || 1080}px`;
      el.style.objectFit = s.fit || 'cover';
      if (s.src && el.getAttribute('src') !== s.src) el.setAttribute('src', s.src);
      if (editMode) {
        // Edit Mode treats videos as still-frame sources. Removing the poster
        // ensures the decoded frame at currentTime is visible while scrubbing.
        if (el.hasAttribute('poster')) el.removeAttribute('poster');
        el.pause?.();
        el.autoplay=false;
        el.removeAttribute('autoplay');
        el.removeAttribute('controls');
      } else if (s.poster) {
        if (el.getAttribute('poster') !== s.poster) el.setAttribute('poster', s.poster);
      } else if (el.hasAttribute('poster')) {
        el.removeAttribute('poster');
      }
      const playbackRate=Math.max(.25,Math.min(3,Number(s.playbackRate)||1));
      if(Math.abs(Number(el.playbackRate)-playbackRate)>.001)el.playbackRate=playbackRate;
      el.defaultPlaybackRate=playbackRate;
      if ((!s.sourceWidth || !s.sourceHeight) && el.videoWidth > 0 && el.videoHeight > 0) {
        s.sourceWidth = el.videoWidth;
        s.sourceHeight = el.videoHeight;
      }
    }
    const lift = transitionLiftFor(id);
    applyTransformToElement(el, s, lift);
    if (editMode && editorPriorityIds.has(id)) el.style.zIndex = String((Number(s.z) || 0) + 0.45);
    const baseOpacity = runtimeOpacity(id, s);
    if (id === 'characterMain') {
      el.style.opacity = String(baseOpacity);
      applyTransformToElement(characterMainLens, s, lift);
      characterMainLens.style.opacity = '0';
      characterMainLens.style.visibility = 'hidden';
      characterMainLens.style.display = 'none';
      characterMainLens.style.zIndex = String(s.z + 0.2);
      applyImageAdjustments(characterMainLens, s);
    } else if (id === 'characterPerspective' || id === 'characterBones') {
      // These are independent editor layers, but in normal preview they only
      // appear inside the cursor lens.
      el.style.opacity = editMode ? String(baseOpacity) : '0';
    } else {
      el.style.opacity = String(baseOpacity);
    }
    if (id === 'backgroundPerspective') {
      el.style.mixBlendMode = 'screen';
      el.style.pointerEvents = editMode ? '' : 'none';
    }
    if (s?.xrayLayer) {
      el.classList.add('xray-mask-stable');
      el.style.pointerEvents = editMode ? '' : 'none';
      if (!editMode && !lastLensActive) el.style.opacity = '0';
      const pairId = String(s.xrayPairOf || '');
      const pairEl = pairId ? elementFor(pairId) : null;
      if (pairEl) pairEl.classList.add('xray-pair-layer', 'xray-mask-stable');
    }
    if (id === 'star') el.style.opacity = String(baseOpacity);
  }

  function setEditorSelectionPriority(ids = []) {
    const previous = editorPriorityIds;
    editorPriorityIds = new Set((ids || []).filter(id => layout.layers[id]));
    const affected = new Set([...previous, ...editorPriorityIds]);
    affected.forEach(id => { if (layout.layers[id]) applyLayer(id); });
  }

  function applyLayout() {
    syncUiLanguage();
    applyBackground();
    if (stageGeometryReady) applyBackgroundPerspectiveBinding({ captureIfMissing: true });
    applySceneVisibility();
    syncCoreLayerPresence();
    syncDynamicLayers();
    Object.keys(layout.layers).forEach(applyLayer);
    applyTransitionShade();
    applySceneShades();
    applyLensAppearance(lastLensActive);
    window.dispatchEvent(new CustomEvent('scene-layout-applied', { detail: layout }));
  }

  function resize() {
    const vw = window.innerWidth;
    const cinematicStory = !editMode ? window.__joeSimpleVideoStory : null;
    // Keep the cinematic stage on the physical height captured at lock time.
    // Safari may fire resize-like viewport changes during momentum; those must
    // not re-scale Scene 2/3/4 or their top/bottom masks mid-gesture.
    const vh = cinematicStory?.stackLocked && Number(cinematicStory.lockedViewportHeight) > 0
      ? Number(cinematicStory.lockedViewportHeight)
      : window.innerHeight;
    stageScale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    stageLeft = (vw - DESIGN_W * stageScale) / 2;
    stageTop = (vh - DESIGN_H * stageScale) / 2;
    root.style.setProperty('--stage-scale', stageScale.toFixed(7));
    root.style.setProperty('--stage-left', `${stageLeft.toFixed(2)}px`);
    root.style.setProperty('--stage-top', `${stageTop.toFixed(2)}px`);
    stageGeometryReady = true;
    applyBackgroundPerspectiveBinding({ captureIfMissing: true });

    const videoTransforms = {};
    for (const module of (sceneRegistry?.all() || [])) {
      const videoLayer = Object.values(module.layers || {}).find(layer => layer?.type === 'video');
      if (!videoLayer || !module.stageId) continue;
      const baseW = Math.max(1, Number(videoLayer.width || 1920));
      const baseH = Math.max(1, Number(videoLayer.height || 1080));
      const scale = Math.max(vw / baseW, vh / baseH);
      const left = (vw - baseW * scale) / 2;
      const top = (vh - baseH * scale) / 2;
      root.style.setProperty(`--scene${module.id}-stage-scale`, scale.toFixed(7));
      root.style.setProperty(`--scene${module.id}-stage-left`, `${left.toFixed(2)}px`);
      root.style.setProperty(`--scene${module.id}-stage-top`, `${top.toFixed(2)}px`);
      videoTransforms[module.id] = { scale, left, top, width:baseW, height:baseH };
    }

    applySceneDwellLayout();
    updateScrollProgress();
    syncGlobalLensState(lastLensActive);
    window.dispatchEvent(new CustomEvent('scene-resized', { detail: { stageScale, stageLeft, stageTop, videoTransforms } }));
  }

  function viewportToScene(clientX, clientY, sceneId = MIN_SCENE_ID) {
    const sceneStage = stageForScene(sceneId);
    if (!sceneStage) return { x: 0, y: 0 };
    const rect = sceneStage.getBoundingClientRect();
    if (Number(sceneId) >= 5) return { x: clientX - rect.left, y: clientY - rect.top };
    const module = sceneRegistry?.get(Number(sceneId));
    const videoLayer = Object.values(module?.layers || {}).find(layer => layer?.type === 'video');
    const baseW = videoLayer ? Number(videoLayer.width || 1920) : DESIGN_W;
    const scale = Math.max(0.000001, rect.width / baseW);
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }

  function sceneToLayer(sceneX, sceneY, layerId) {
    const s = layout.layers[layerId];
    if (!s) return { x: 0, y: 0 };
    const y = s.y + transitionLiftFor(layerId);
    const rad = -s.rotation * Math.PI / 180;
    const dx = sceneX - s.x;
    const dy = sceneY - y;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { x: rx / s.scale, y: ry / s.scale };
  }

  const alphaSource = new Image();
  alphaSource.decoding = 'async';
  alphaSource.src = 'scenes/scene-1/assets/character-main.png';
  alphaSource.onload = () => {
    alphaCtx.clearRect(0, 0, CHAR_W, CHAR_H);
    alphaCtx.drawImage(alphaSource, 0, 0, CHAR_W, CHAR_H);
    alphaPixels = alphaCtx.getImageData(0, 0, CHAR_W, CHAR_H).data;
    alphaReady = true;
  };

  function alphaAt(ix, iy) {
    if (ix < 0 || iy < 0 || ix >= CHAR_W || iy >= CHAR_H) return false;
    if (!alphaReady || !alphaPixels) return true;
    return alphaPixels[(iy * CHAR_W + ix) * 4 + 3] > 24;
  }

  function characterHitOrNear(sceneX, sceneY) {
    const local = sceneToLayer(sceneX, sceneY, 'characterMain');
    const ix = Math.round(local.x), iy = Math.round(local.y);
    const activation = Math.max(0, Number(layout.xray?.activationDistance ?? (Number(layout.xray?.radius ?? 184) * 0.5)));

    // Cheap early rejection outside the expanded character image bounds.
    if (ix < -activation || iy < -activation || ix >= CHAR_W + activation || iy >= CHAR_H + activation) return false;
    if (alphaAt(ix, iy)) return true;
    if (activation <= 0 || !alphaReady) return false;

    // Probe concentric rings around the cursor. This behaves like a dilated
    // alpha silhouette without rebuilding a large distance map on every edit.
    // The sampling density grows with the ring circumference, so thin limbs
    // still trigger reliably while pointermove remains inexpensive.
    const radialStep = 7;
    for (let radius = radialStep; radius <= activation; radius += radialStep) {
      const samples = Math.max(16, Math.ceil((Math.PI * 2 * radius) / 10));
      for (let i = 0; i < samples; i++) {
        const a = (i / samples) * Math.PI * 2;
        const sx = Math.round(ix + Math.cos(a) * radius);
        const sy = Math.round(iy + Math.sin(a) * radius);
        if (alphaAt(sx, sy)) return true;
      }
    }
    return false;
  }

  function applyMask(el, inverse, localX, localY, active, radiusOverride = null, featherOverride = null) {
    if (!el) return;

    const resetMaskGeometry = () => {
      el.style.webkitMaskRepeat = 'no-repeat';
      el.style.maskRepeat = 'no-repeat';
      el.style.webkitMaskSize = '100% 100%';
      el.style.maskSize = '100% 100%';
      el.style.webkitMaskPosition = '0px 0px';
      el.style.maskPosition = '0px 0px';
      el.style.webkitMaskOrigin = 'border-box';
      el.style.maskOrigin = 'border-box';
      el.style.webkitMaskClip = 'border-box';
      el.style.maskClip = 'border-box';
    };

    if (!active) {
      if (el.dataset.joeMaskMode) {
        el.style.webkitMaskImage = 'none';
        el.style.maskImage = 'none';
        el.style.webkitMaskComposite = '';
        el.style.maskComposite = '';
        delete el.dataset.joeMaskMode;
      }
      return;
    }

    const radius = Math.max(1, Number(radiusOverride ?? layout.xray?.radius ?? 184));
    const feather = Math.max(0, Number(featherOverride ?? layout.xray?.feather ?? 52));
    const edge = radius + feather;
    const soft = radius + feather * 0.35;
    const x = Number.isFinite(localX) ? localX : 0;
    const y = Number.isFinite(localY) ? localY : 0;

    // Chrome is much more stable when the mask shader itself stays mounted and
    // only its CSS variables change. Replacing mask-image strings for 6+ large
    // transformed PNGs on every pointermove can force repeated raster/compositor
    // teardown and appear as full-scene flashing.
    el.style.setProperty('--joe-lens-x', `${x.toFixed(3)}px`);
    el.style.setProperty('--joe-lens-y', `${y.toFixed(3)}px`);
    el.style.setProperty('--joe-lens-radius', `${radius.toFixed(3)}px`);
    el.style.setProperty('--joe-lens-soft', `${soft.toFixed(3)}px`);
    el.style.setProperty('--joe-lens-edge', `${edge.toFixed(3)}px`);

    const mode = inverse ? 'inverse' : 'reveal';
    if (el.dataset.joeMaskMode !== mode) {
      el.style.webkitMaskComposite = '';
      el.style.maskComposite = '';
      const gradient = inverse
        ? 'radial-gradient(circle var(--joe-lens-edge) at var(--joe-lens-x) var(--joe-lens-y), transparent 0 var(--joe-lens-radius), rgba(0,0,0,0.18) var(--joe-lens-soft), #000 var(--joe-lens-edge))'
        : 'radial-gradient(circle var(--joe-lens-edge) at var(--joe-lens-x) var(--joe-lens-y), #000 0 var(--joe-lens-radius), rgba(0,0,0,0.82) var(--joe-lens-soft), transparent var(--joe-lens-edge))';
      resetMaskGeometry();
      el.style.webkitMaskImage = gradient;
      el.style.maskImage = gradient;
      el.dataset.joeMaskMode = mode;
    }
  }

  function applyMultiMask(el, inverse, points, active, radiusOverride = null, featherOverride = null) {
    if (!el || !active || !points?.length) { applyMask(el, inverse, 0, 0, false); return; }
    const radius = Math.max(1, Number(radiusOverride ?? layout.xray?.radius ?? 184));
    const feather = Math.max(0, Number(featherOverride ?? layout.xray?.feather ?? 52));
    const edge = radius + feather;
    const gradients = points.slice(0, 3).map(point => {
      const x = Number(point.x) || 0, y = Number(point.y) || 0;
      return inverse
        ? `radial-gradient(circle ${edge}px at ${x}px ${y}px, transparent 0 ${radius}px, rgba(0,0,0,.18) ${radius + feather * .35}px, #000 ${edge}px)`
        : `radial-gradient(circle ${edge}px at ${x}px ${y}px, #000 0 ${radius}px, rgba(0,0,0,.82) ${radius + feather * .35}px, transparent ${edge}px)`;
    });
    el.style.webkitMaskImage = gradients.join(',');
    el.style.maskImage = gradients.join(',');
    el.style.webkitMaskComposite = inverse ? 'intersect' : 'add';
    el.style.maskComposite = inverse ? 'intersect' : 'add';
    el.dataset.joeMaskMode = inverse ? 'multi-inverse' : 'multi-reveal';
  }

  function applyDualMask(el, oldInverse, oldPoint, oldRadius, newInverse, newPoint, newRadius, feather) {
    if (!el) return;
    const make = (inverse, point, radius) => {
      const edge = radius + feather;
      return inverse
        ? `radial-gradient(circle ${edge}px at ${point.x}px ${point.y}px, transparent 0 ${radius}px, rgba(0,0,0,.18) ${radius + feather * .35}px, #000 ${edge}px)`
        : `radial-gradient(circle ${edge}px at ${point.x}px ${point.y}px, #000 0 ${radius}px, rgba(0,0,0,.82) ${radius + feather * .35}px, transparent ${edge}px)`;
    };
    // The two masks describe complementary halves of the transition. Reality
    // uses a disjoint outside+inside union; digital uses an intersection so
    // its expanding region remains an annulus instead of overlapping reality.
    // The newborn circle must always grow from an empty region. Applying an
    // inverse mask at radius 0 would make its entire outside visible and
    // incorrectly cover the old scene from the first animation frame.
    el.style.webkitMaskImage = `${make(oldInverse, oldPoint, oldRadius)}, ${make(newInverse, newPoint, newRadius)}`;
    el.style.maskImage = `${make(oldInverse, oldPoint, oldRadius)}, ${make(newInverse, newPoint, newRadius)}`;
    const composite = oldInverse === newInverse ? 'add' : (oldInverse ? 'add' : 'intersect');
    el.style.webkitMaskComposite = composite;
    el.style.maskComposite = composite;
    el.dataset.joeMaskMode = 'dual-transition';
  }


  function layerLensGeometry(layerId) {
    const state = layout.layers[layerId];
    const scale = Math.max(0.000001, Math.abs(Number(state?.scale) || 1));
    const radius = Math.max(1, Number(layout.xray?.radius ?? 184)) * lensRadiusMultiplier / scale;
    const feather = Math.max(0, Number(layout.xray?.feather ?? 52)) / scale;
    return { radius, feather };
  }

  function syncGlobalLensState(active = lastLensActive) {
    const scene = window.__lastLensScene || { x: 0, y: 0 };
    const viewportPoint = scenePointToViewport(scene.x, scene.y, 1);
    const physicalScale = Math.max(0.000001, Number(stageScale) || 1);
    const next = {
      active: Boolean(active) && domainOwnsScene(1) && !editMode,
      inverted: Boolean(lensInverted),
      sceneX: Number(scene.x) || 0,
      sceneY: Number(scene.y) || 0,
      viewportX: Number(viewportPoint.x) || 0,
      viewportY: Number(viewportPoint.y) || 0,
      radius: Math.max(1, Number(layout.xray?.radius ?? 184)) * (lensTransition?.oldRadius ?? lensRadiusMultiplier),
      feather: Math.max(0, Number(layout.xray?.feather ?? 52)),
      radiusPx: Math.max(1, Number(layout.xray?.radius ?? 184)) * (lensTransition?.oldRadius ?? lensRadiusMultiplier) * physicalScale,
      featherPx: Math.max(0, Number(layout.xray?.feather ?? 52)) * physicalScale
      ,touchPoints: touchLensPoints.slice(0, 3).map(point => ({ x: point.x, y: point.y }))
    };
    if (lensTransition) next.transitionRadiusPx = Math.max(1, Number(layout.xray?.radius ?? 184)) * lensTransition.oldRadius * physicalScale;
    window.__joeXrayLensState = next;
    try { window.dispatchEvent(new CustomEvent('joe-xray-lens-change', { detail: next })); } catch (_) {}
    return next;
  }

  function applyLensAppearance(active) {
    const globalLens = syncGlobalLensState(active);
    const sceneBackgroundState = layout.layers.scene1Background;
    const sceneBackgroundEl = elementFor('scene1Background');
    const mainState = layout.layers.characterMain;
    const perspectiveState = layout.layers.characterPerspective;
    const backgroundPerspectiveState = layout.layers.backgroundPerspective;
    const bonesState = layout.layers.characterBones;
    const extraXrayEntries = Object.entries(layout.layers || {}).filter(([id, state]) => Boolean(state?.xrayLayer));

    const resetGradeMask = () => applyMask(backgroundGrade, false, 0, 0, false);
    const resetExtraPairs = () => {
      for (const [overlayId, overlayState] of extraXrayEntries) {
        const overlayEl = elementFor(overlayId);
        applyMask(overlayEl, false, 0, 0, false);
        if (overlayEl) overlayEl.style.opacity = editMode ? String(runtimeOpacity(overlayId, overlayState)) : '0';
        const pairId = String(overlayState?.xrayPairOf || '');
        if (!pairId) continue;
        const pairEl = elementFor(pairId);
        const pairState = layout.layers?.[pairId];
        applyMask(pairEl, false, 0, 0, false);
        if (pairEl && pairState) pairEl.style.opacity = String(runtimeOpacity(pairId, pairState));
      }
    };
    const sceneOneTextLayers = Object.entries(layout.layers || {}).filter(([, state]) => state?.type === 'text' && Number(state.scene) === 1);
    const resetSceneOneTextMasks = () => {
      for (const [textId] of sceneOneTextLayers) applyMask(elementFor(textId), false, 0, 0, false);
    };

    if (editMode) {
      applyMask(sceneBackgroundEl, false, 0, 0, false);
      resetGradeMask();
      applyMask(elMap.characterMain, false, 0, 0, false);
      applyMask(characterMainLens, false, 0, 0, false);
      applyMask(elMap.characterPerspective, false, 0, 0, false);
      applyMask(elMap.backgroundPerspective, false, 0, 0, false);
      applyMask(elMap.characterBones, false, 0, 0, false);
      if (sceneBackgroundState && sceneBackgroundEl) sceneBackgroundEl.style.opacity = String(runtimeOpacity('scene1Background', sceneBackgroundState));
      if (mainState && elMap.characterMain) elMap.characterMain.style.opacity = String(runtimeOpacity('characterMain', mainState));
      characterMainLens.style.opacity = '0';
      if (perspectiveState && elMap.characterPerspective) elMap.characterPerspective.style.opacity = String(runtimeOpacity('characterPerspective', perspectiveState));
      if (backgroundPerspectiveState && elMap.backgroundPerspective) elMap.backgroundPerspective.style.opacity = String(runtimeOpacity('backgroundPerspective', backgroundPerspectiveState));
      if (bonesState && elMap.characterBones) elMap.characterBones.style.opacity = String(runtimeOpacity('characterBones', bonesState));
      resetExtraPairs();
      resetSceneOneTextMasks();
      return;
    }

    const xrayPerspectiveOpacity = Number(layout.xray?.perspectiveOpacity ?? 0.66);
    const xrayBonesOpacity = Number(layout.xray?.bonesOpacity ?? 0.92);

    if (!active) {
      applyMask(sceneBackgroundEl, false, 0, 0, false);
      resetGradeMask();
      applyMask(elMap.characterMain, false, 0, 0, false);
      applyMask(characterMainLens, false, 0, 0, false);
      applyMask(elMap.characterPerspective, false, 0, 0, false);
      applyMask(elMap.backgroundPerspective, false, 0, 0, false);
      applyMask(elMap.characterBones, false, 0, 0, false);
      if (sceneBackgroundState && sceneBackgroundEl) sceneBackgroundEl.style.opacity = String(runtimeOpacity('scene1Background', sceneBackgroundState));
      if (mainState && elMap.characterMain) elMap.characterMain.style.opacity = String(runtimeOpacity('characterMain', mainState));
      characterMainLens.style.opacity = '0';
      if (elMap.characterPerspective) elMap.characterPerspective.style.opacity = '0';
      if (elMap.backgroundPerspective) elMap.backgroundPerspective.style.opacity = '0';
      if (elMap.characterBones) elMap.characterBones.style.opacity = '0';
      resetExtraPairs();
      resetSceneOneTextMasks();
      return;
    }

    const scene = window.__lastLensScene || { x: 0, y: 0 };

    const maskLayerEffect = (el, inverse, layerId) => {
      if (!el) return;
      const group = String(layout.layers?.[layerId]?.displayGroup || '');
      if (group === 'reality') inverse = true;
      else if (group === 'digital') inverse = false;
      inverse = lensInverted ? !inverse : inverse;
      const local = sceneToLayer(scene.x, scene.y, layerId);
      const lens = layerLensGeometry(layerId);
      if (lensTransition) {
        const oldScene = lensTransition.oldScene || scene;
        const oldLocal = sceneToLayer(oldScene.x, oldScene.y, layerId);
        const baseRadius = Math.max(1, Number(layout.xray?.radius ?? 184)) / Math.max(.0001, Math.abs(Number(layout.layers[layerId]?.scale) || 1));
        const baseInverse = group === 'reality' ? true : group === 'digital' ? false : inverse;
        applyDualMask(el,
          lensTransition.oldInverted ? !baseInverse : baseInverse, oldLocal,
          baseRadius * lensTransition.oldRadius,
          lensTransition.newInverted ? !baseInverse : baseInverse,
          local, lens.radius, lens.feather);
        return;
      }
      // Safari can crash when several large transformed images each receive a
      // multi-layer CSS mask. Keep the image path on the stable single-mask
      // compositor path; the touch-point union remains available to the
      // lightweight digital-rain shader.
      applyMask(el, inverse, local.x, local.y, true, lens.radius, lens.feather);
    };

    const maskViewportEffect = (el, inverse) => {
      if (!el) return;
      inverse = lensInverted ? !inverse : inverse;
      const r = el.getBoundingClientRect();
      if (lensTransition) {
        const oldViewport = lensTransition.oldViewport || { x: globalLens.viewportX, y: globalLens.viewportY };
        const oldPoint = { x: oldViewport.x - r.left, y: oldViewport.y - r.top };
        const point = { x: globalLens.viewportX - r.left, y: globalLens.viewportY - r.top };
        applyDualMask(el,
          lensTransition.oldInverted ? !inverse : inverse, oldPoint,
          globalLens.radiusPx * lensTransition.oldRadius / Math.max(.0001, lensRadiusMultiplier),
          lensTransition.newInverted ? !inverse : inverse,
          point, globalLens.radiusPx, globalLens.featherPx);
        return;
      }
      applyMask(el, inverse, globalLens.viewportX - r.left, globalLens.viewportY - r.top, true, globalLens.radiusPx, globalLens.featherPx);
    };

    // The real Scene-1 photo is cut out exactly like the normal character body.
    // This lets the digital rain + perspective artwork behind it remain unobstructed.
    if (sceneBackgroundState?.visible && sceneBackgroundEl) {
      maskLayerEffect(sceneBackgroundEl, true, 'scene1Background');
      sceneBackgroundEl.style.opacity = String(runtimeOpacity('scene1Background', sceneBackgroundState));
    } else {
      applyMask(sceneBackgroundEl, false, 0, 0, false);
    }

    // The viewport grade is also removed inside the same physical lens so the
    // X-ray region is truly transparent rather than still darkened by grading.
    if (backgroundGrade) {
      maskViewportEffect(backgroundGrade, true);
    }

    // Text remains readable outside the lens, but becomes transparent inside
    // the perspective region so the X-ray artwork can take visual priority.
    for (const [textId] of sceneOneTextLayers) {
      const textEl = elementFor(textId);
      // Text lives on the same design stage as the background and character.
      // Use the scene-space mask so stage scaling cannot create a second
      // apparent circle or shift its centre relative to the X-ray artwork.
      if (textEl) {
        const local = sceneToLayer(scene.x, scene.y, textId);
        const lens = layerLensGeometry(textId);
        const baseRadius = Math.max(1, Number(layout.xray?.radius ?? 184)) / Math.max(.0001, Math.abs(Number(layout.layers[textId]?.scale) || 1));
        const group = String(layout.layers?.[textId]?.displayGroup || 'reality');
        const inverse = group === 'digital' ? false : true;
        const oldTextLocal = lensTransition?.oldScene ? sceneToLayer(lensTransition.oldScene.x, lensTransition.oldScene.y, textId) : local;
        if (lensTransition) applyDualMask(textEl,
          lensTransition.oldInverted ? !inverse : inverse, oldTextLocal,
          baseRadius * lensTransition.oldRadius,
          lensTransition.newInverted ? !inverse : inverse,
          local, lens.radius, lens.feather);
        else applyMask(textEl, lensInverted ? !inverse : inverse, local.x, local.y, true, lens.radius, lens.feather);
      }
    }

    if (mainState?.visible && elMap.characterMain) {
      maskLayerEffect(elMap.characterMain, true, 'characterMain');
    } else {
      applyMask(elMap.characterMain, false, 0, 0, false);
    }
    applyMask(characterMainLens, false, 0, 0, false);
    characterMainLens.style.display = 'none';
    characterMainLens.style.opacity = '0';

    if (perspectiveState && elMap.characterPerspective) {
      maskLayerEffect(elMap.characterPerspective, false, 'characterPerspective');
      elMap.characterPerspective.style.opacity = String(runtimeOpacity('characterPerspective', perspectiveState) * xrayPerspectiveOpacity);
    } else if (elMap.characterPerspective) {
      applyMask(elMap.characterPerspective, false, 0, 0, false);
      elMap.characterPerspective.style.opacity = '0';
    }

    if (backgroundPerspectiveState && elMap.backgroundPerspective) {
      maskLayerEffect(elMap.backgroundPerspective, false, 'backgroundPerspective');
      elMap.backgroundPerspective.style.opacity = String(runtimeOpacity('backgroundPerspective', backgroundPerspectiveState) * xrayPerspectiveOpacity);
    } else if (elMap.backgroundPerspective) {
      applyMask(elMap.backgroundPerspective, false, 0, 0, false);
      elMap.backgroundPerspective.style.opacity = '0';
    }

    if (bonesState && elMap.characterBones) {
      maskLayerEffect(elMap.characterBones, false, 'characterBones');
      elMap.characterBones.style.opacity = String(runtimeOpacity('characterBones', bonesState) * xrayBonesOpacity);
    } else if (elMap.characterBones) {
      applyMask(elMap.characterBones, false, 0, 0, false);
      elMap.characterBones.style.opacity = '0';
    }

    for (const [overlayId, overlayState] of extraXrayEntries) {
      const overlayEl = elementFor(overlayId);
      if (!overlayEl || overlayState?.visible === false) {
        applyMask(overlayEl, false, 0, 0, false);
        if (overlayEl) overlayEl.style.opacity = '0';
      } else {
        maskLayerEffect(overlayEl, false, overlayId);
        overlayEl.style.opacity = String(runtimeOpacity(overlayId, overlayState) * xrayPerspectiveOpacity);
      }

      const pairId = String(overlayState?.xrayPairOf || '');
      const pairEl = pairId ? elementFor(pairId) : null;
      const pairState = pairId ? layout.layers?.[pairId] : null;
      if (pairEl && pairState?.visible !== false) {
        maskLayerEffect(pairEl, true, pairId);
        pairEl.style.opacity = String(runtimeOpacity(pairId, pairState));
      } else if (pairEl) {
        applyMask(pairEl, false, 0, 0, false);
        if (pairState) pairEl.style.opacity = String(runtimeOpacity(pairId, pairState));
      }
    }

    if (mainState && elMap.characterMain) elMap.characterMain.style.opacity = String(runtimeOpacity('characterMain', mainState));
  }

  function activeInteractionDomainId() {
    const story = window.__joeSimpleVideoStory;
    if (!story?.active || typeof story.getActiveDomainId !== 'function') return null;
    const id = Number(story.getActiveDomainId());
    return Number.isFinite(id) ? id : null;
  }

  function domainOwnsScene(sceneId) {
    const active = activeInteractionDomainId();
    return active == null || Number(sceneId) === active;
  }


  let pendingLensPoint = null;
  let lensFrameRequest = 0;
  let touchLensPoints = [];
  let lensRadiusMultiplier = 1;
  let lensExpansionFrame = 0;
  let lensBirthFrame = 0;
  let lensInverted = false;
  let lensTransition = null;

  function animateLensBirth() {
    if (lensBirthFrame || lensExpansionFrame || touchLensPoints.length || editMode) return;
    const start = performance.now();
    // Cursor entry and click expansion share the same user-configurable pace.
    const duration = Math.max(200, Math.min(5000, Number(layout.xray?.expansionDurationMs) || 1050));
    const frame = now => {
      if (!lastLensActive || lensExpansionFrame || touchLensPoints.length || editMode) {
        lensBirthFrame = 0;
        return;
      }
      const progress = Math.min(1, (now - start) / duration);
      const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      lensRadiusMultiplier = eased;
      syncGlobalLensState(true);
      applyLensAppearance(true);
      if (progress < 1) lensBirthFrame = requestAnimationFrame(frame);
      else {
        lensRadiusMultiplier = 1;
        lensBirthFrame = 0;
      }
    };
    lensRadiusMultiplier = 0;
    lensBirthFrame = requestAnimationFrame(frame);
  }

  function animateLensExpansion(clickPoint = null) {
    if (lensExpansionFrame || touchLensPoints.length || editMode || !lastLensActive) return;
    if (lensBirthFrame) {
      cancelAnimationFrame(lensBirthFrame);
      lensBirthFrame = 0;
      lensRadiusMultiplier = 1;
    }
    const start = performance.now();
    const startingPolarity = lensInverted;
    const clickScene = clickPoint ? viewportToScene(Number(clickPoint.x), Number(clickPoint.y), 1) : window.__lastLensScene;
    const duration = Math.max(200, Math.min(5000, Number(layout.xray?.expansionDurationMs) || 1050));
    const peak = Math.max(8, Math.hypot(window.innerWidth, window.innerHeight) / Math.max(1, Number(layout.xray?.radius ?? 184)));
    const frame = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = progress < .5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      if (progress >= 1) {
        // Commit the reversed state directly at the terminal frame. Rendering
        // the dual transition mask once more at 100% causes a one-frame flash
        // of the previous circle on the outside, especially on the second tap.
        lensExpansionFrame = 0;
        lensTransition = null;
        lensRadiusMultiplier = 1;
        lensInverted = !startingPolarity;
        syncGlobalLensState(true);
        applyLensAppearance(true);
        return;
      }
      const oldRadius = 1 + (peak - 1) * eased;
      const newRadius = eased;
      // The expanding outer circle is the current inner-circle content. After
      // the first reversal that identity is opposite to the fullscreen
      // polarity, so derive it explicitly instead of reusing the fullscreen
      // flag (which made the second click expand the wrong circle).
      lensTransition = { oldRadius, newRadius, oldInverted: startingPolarity, newInverted: !startingPolarity,
        oldScene: clickScene ? { x: clickScene.x, y: clickScene.y } : null,
        oldViewport: clickPoint ? { x: Number(clickPoint.x), y: Number(clickPoint.y) } : null };
      lensRadiusMultiplier = newRadius;
      lensInverted = startingPolarity;
      syncGlobalLensState(true);
      applyLensAppearance(true);
      if (progress < 1) lensExpansionFrame = requestAnimationFrame(frame);
      else { lensExpansionFrame = 0; }
    };
    lensExpansionFrame = requestAnimationFrame(frame);
  }

  function flushLensFrame() {
    lensFrameRequest = 0;
    const point = pendingLensPoint;
    pendingLensPoint = null;
    if (!point || editMode || !domainOwnsScene(1)) { hideLens(); return; }
    const mainVisible = Boolean(layout.layers.characterMain?.visible);
    const bgPerspectiveVisible = Boolean(layout.layers.backgroundPerspective?.visible);
    const extraPerspectiveVisible = Object.values(layout.layers || {}).some(state => state?.xrayLayer && state.visible !== false);
    if (!mainVisible && !bgPerspectiveVisible && !extraPerspectiveVisible) { hideLens(); return; }
    const lensSurface = document.getElementById('sceneOneSticky') || sceneRootFor(1) || stageForScene(1);
    const rect = lensSurface?.getBoundingClientRect?.();
    const x = Number(point.x);
    const y = Number(point.y);
    const outsideViewport = !Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0 || x >= window.innerWidth - 1 || y >= window.innerHeight - 1;
    if (outsideViewport || !rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      hideLens();
      return;
    }
    const scene = viewportToScene(x, y, 1);
    window.__lastLensScene = scene;
    const wasInactive = !lastLensActive;
    lastLensActive = true;
    if (wasInactive && point.pointerType !== 'touch') {
      lensRadiusMultiplier = 0;
      syncGlobalLensState(true);
      applyLensAppearance(true);
      animateLensBirth();
    } else {
      syncGlobalLensState(true);
      applyLensAppearance(true);
    }
  }

  function updateLens(e) {
    if (e?.pointerType === 'touch') {
      const point = touchLensPoints.find(item => item.pointerId === e.pointerId);
      if (!point) return;
      point.x = Number(e.clientX); point.y = Number(e.clientY);
      pendingLensPoint = { x: point.x, y: point.y };
    } else pendingLensPoint = { x: Number(e?.clientX), y: Number(e?.clientY) };
    if (!lensFrameRequest) lensFrameRequest = requestAnimationFrame(flushLensFrame);
  }

  let touchLensHeld = false;
  let touchLensPointerId = null;
  window.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || editMode) return;
    if (touchLensPoints.length >= 3) return;
    touchLensPoints.push({ pointerId: event.pointerId, x: Number(event.clientX), y: Number(event.clientY) });
    touchLensPointerId = touchLensPoints[0]?.pointerId ?? null;
    touchLensHeld = true;
    updateLens(event);
  }, { passive: true });
  window.addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch') return;
    touchLensPoints = touchLensPoints.filter(point => point.pointerId !== event.pointerId);
    touchLensPointerId = touchLensPoints[0]?.pointerId ?? null;
    if (touchLensPoints.length) { updateLens({ pointerType: 'touch', pointerId: touchLensPoints[0].pointerId, clientX: touchLensPoints[0].x, clientY: touchLensPoints[0].y }); return; }
    touchLensHeld = false;
    hideLens();
  }, { passive: true });
  window.addEventListener('pointercancel', event => {
    if (event.pointerType !== 'touch') return;
    touchLensPoints = touchLensPoints.filter(point => point.pointerId !== event.pointerId);
    touchLensPointerId = touchLensPoints[0]?.pointerId ?? null;
    if (touchLensPoints.length) return;
    touchLensHeld = false;
    hideLens();
  }, { passive: true });
  document.getElementById('sceneOneInteractionSurface')?.addEventListener('click', event => {
    if (editMode || event.detail === 0 || window.matchMedia?.('(pointer: coarse), (max-width: 820px)')?.matches) return;
    animateLensExpansion({ x: event.clientX, y: event.clientY });
  });

  function hideLens() {
    pendingLensPoint = null;
    if (lensFrameRequest) {
      cancelAnimationFrame(lensFrameRequest);
      lensFrameRequest = 0;
    }
    lastLensActive = false;
    if (lensExpansionFrame) cancelAnimationFrame(lensExpansionFrame);
    lensExpansionFrame = 0;
    if (lensBirthFrame) cancelAnimationFrame(lensBirthFrame);
    lensBirthFrame = 0;
    lensRadiusMultiplier = 1;
    lensInverted = false;
    lensTransition = null;
    applyLensAppearance(false);
  }

  function handleDocumentPointerExit(event) {
    // pointerleave on window is inconsistent when the pointer crosses into the
    // browser's tab/toolbar chrome. A bubbling mouseout/pointerout whose
    // relatedTarget is null is the reliable signal that the document was left.
    if (event?.relatedTarget == null) hideLens();
  }

  function updateScrollProgress() {
    applySceneDwellLayout();
    if(editMode){for(const scene of SCENE_IDS)sceneScrollProgress[scene]=0;root.style.setProperty('--bg-scroll-y','0px');for(const scene of SCENE_IDS){const img=ensureSceneBackgroundElement(scene),wrapper=Number(scene)===1?img?.closest('.viewport-background'):img?.closest('.scene-managed-background');wrapper?.style.setProperty('--scene-bg-scroll-y','0px')}applyLayout();return;}

    // v44 Domain Isolation: only the active scene is allowed to consume page
    // scroll as interaction state. Inactive scenes keep their previous progress
    // frozen. Cinematic crossfades still update render-only layers explicitly via
    // the story engine's applyVisuals(), not through this scroll path.
    const activeDomain = activeInteractionDomainId();
    if(activeDomain==null){
      for(const scene of SCENE_IDS)sceneScrollProgress[scene]=computeSceneProgress(scene);
    }else if(SCENE_IDS.includes(Number(activeDomain))){
      sceneScrollProgress[activeDomain]=computeSceneProgress(activeDomain);
    }

    if(activeDomain==null||Number(activeDomain)===1){
      scrollProgress=sceneProgressFor(1);
      const offset=backgroundScrollOffset(1).toFixed(2);
      root.style.setProperty('--bg-scroll-y',`${offset}px`);
      const img=ensureSceneBackgroundElement(1),wrapper=img?.closest('.viewport-background');
      wrapper?.style.setProperty('--scene-bg-scroll-y',`${offset}px`);
    }
    if(activeDomain!=null&&Number(activeDomain)!==1){
      const scene=Number(activeDomain);
      const img=ensureSceneBackgroundElement(scene),wrapper=img?.closest('.scene-managed-background');
      if(wrapper)wrapper.style.setProperty('--scene-bg-scroll-y',`${backgroundScrollOffset(scene).toFixed(2)}px`);
    }

    applyTransitionShade();applySceneShades();applySceneCrossfades();
    if(activeDomain==null){
      Object.keys(layout.layers).forEach(applyLayer);
    }else{
      for(const [layerId,layer] of Object.entries(layout.layers)){if(sceneOfLayer(layer)===Number(activeDomain))applyLayer(layerId);}
    }
    applyLensAppearance(lastLensActive);
    const story=window.__joeSimpleVideoStory;
    if(story?.active&&typeof story.onRuntimeScroll==='function')story.onRuntimeScroll();
    else Object.values(sceneControllers).forEach(controller=>controller?.onScroll?.());
  }

  function uniqueId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function sceneOfLayer(layer) { return validSceneId(layer?.scene ?? MIN_SCENE_ID, MIN_SCENE_ID); }

  function zLevels(targetLayout = layout, sceneId = 1) {
    return [...new Set(Object.values(targetLayout?.layers || {}).filter(layer => sceneOfLayer(layer) === Number(sceneId)).map(layer => Number(layer.z) || 0))].sort((a, b) => b - a);
  }

  function compactLayerDepths(targetLayout = layout, sceneId = null) {
    const scenes=sceneId==null?[...new Set(Object.values(targetLayout?.layers||{}).map(sceneOfLayer))]:[Number(sceneId)];
    let total = 0;
    scenes.forEach(scene => {
      const levels = zLevels(targetLayout, scene);
      total += levels.length;
      const count = levels.length;
      const mapping = new Map(levels.map((z, index) => [z, count - index]));
      Object.values(targetLayout?.layers || {}).forEach(layer => {
        if (sceneOfLayer(layer) === scene) layer.z = mapping.get(Number(layer.z) || 0) ?? 1;
      });
    });
    return total;
  }

  function layerRank(id) {
    const layer = layout.layers[id];
    if (!layer) return null;
    const levels = zLevels(layout, sceneOfLayer(layer));
    const index = levels.indexOf(Number(layer.z) || 0);
    return index < 0 ? null : index + 1;
  }

  function layerCount(sceneId = null) {
    if(sceneId==null)return SCENE_IDS.reduce((total,scene)=>total+zLevels(layout,scene).length,0);
    return zLevels(layout, Number(sceneId)).length;
  }

  function moveLayerStep(id, direction) {
    const layer = layout.layers[id];
    if (!layer) return false;
    const scene = sceneOfLayer(layer);
    const levels = zLevels(layout, scene);
    const currentIndex = levels.indexOf(Number(layer.z) || 0);
    if (currentIndex < 0) return false;
    const targetIndex = currentIndex + (direction > 0 ? 1 : -1);
    if (targetIndex < 0 || targetIndex >= levels.length) return false;

    const currentZ = levels[currentIndex];
    const targetZ = levels[targetIndex];
    const peersAtCurrent = Object.entries(layout.layers).filter(([otherId, other]) => otherId !== id && sceneOfLayer(other) === scene && Number(other.z) === currentZ);

    if (!peersAtCurrent.length) {
      Object.entries(layout.layers).forEach(([otherId, other]) => {
        if (otherId !== id && sceneOfLayer(other) === scene && Number(other.z) === targetZ) other.z = currentZ;
      });
    }
    layer.z = targetZ;
    compactLayerDepths(layout, scene);
    return true;
  }

  function moveLayerToRank(id, requestedRank) {
    const layer = layout.layers[id];
    if (!layer) return false;
    const scene = sceneOfLayer(layer);
    const levels = zLevels(layout, scene);
    let target = Math.round(Number(requestedRank));
    if (!Number.isFinite(target) || !levels.length) return false;
    target = Math.max(1, Math.min(levels.length, target));
    const targetZ = levels[target - 1];
    layer.z = targetZ;
    compactLayerDepths(layout, scene);
    return true;
  }

  function topZ(sceneId = 1) {
    compactLayerDepths(layout, sceneId);
    const layers = Object.values(layout.layers).filter(layer => sceneOfLayer(layer) === Number(sceneId));
    return Math.min(1700, Math.max(0, ...layers.map(x => Number(x.z) || 0)) + 1);
  }

  function textLayerZ(sceneId) {
    const scene = validSceneId(sceneId, MIN_SCENE_ID);
    const texts = Object.values(layout.layers).filter(layer => sceneOfLayer(layer) === scene && layer.type === 'text');
    if (texts.length) return Math.max(...texts.map(layer => Number(layer.z) || 0));
    return topZ(scene);
  }

  function addTextLayer(text = 'New text', sceneId = 1) {
    const id = uniqueId('text');
    const scene = validSceneId(sceneId, MIN_SCENE_ID);
    const sceneStage = stageForScene(scene);
    const rect = sceneStage?.getBoundingClientRect?.();
    const nativeFlowScene = scene >= 5;
    const sceneW = (scene === 2 || scene === 3 || scene === 4) ? 1920 : (nativeFlowScene ? Math.max(320, rect?.width || window.innerWidth) : DESIGN_W);
    const sceneH = (scene === 2 || scene === 3 || scene === 4) ? 1080 : (nativeFlowScene ? Math.max(320, rect?.height || window.innerHeight) : DESIGN_H);
    layout.layers[id] = normaliseLayer(id, {
      type: 'text', scene, core: false, flow: false, name: text.slice(0, 28) || 'Text', text,
      textStyle: textStyle(64, 700, -1.5, 1),
      x: sceneW * .5 - 120, y: sceneH * .5 - 35,
      scale: 1, rotation: 0, opacity: 1, z: textLayerZ(scene), visible: true, locked: false
    });
    syncDynamicLayers();
    applyLayer(id);
    return id;
  }

  async function imageDimensions(blob) {
    // Use HTMLImageElement naturalWidth/naturalHeight rather than raw bitmap
    // dimensions. This follows the same orientation the browser will render
    // (including JPEG metadata) and prevents apparent portrait stretching.
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const width = Math.max(1, Number(img.naturalWidth) || 1);
        const height = Math.max(1, Number(img.naturalHeight) || 1);
        URL.revokeObjectURL(url);
        resolve({ width, height });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image dimensions')); };
      img.src = url;
    });
  }

  async function videoDimensions(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const cleanup = () => { try { video.removeAttribute('src'); video.load(); } catch (_) {} URL.revokeObjectURL(url); };
      video.onloadedmetadata = () => {
        const width = Math.max(1, Number(video.videoWidth) || 1920);
        const height = Math.max(1, Number(video.videoHeight) || 1080);
        cleanup();
        resolve({ width, height });
      };
      video.onerror = () => { cleanup(); reject(new Error('Could not read video dimensions')); };
      video.src = url;
    });
  }

  async function uploadAsset(fileOrBlob, fileName = 'image.png') {
    const type = fileOrBlob?.type || 'application/octet-stream';
    const url = `${API_UPLOAD}?name=${encodeURIComponent(fileName)}&type=${encodeURIComponent(type)}`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': type }, body: fileOrBlob });
    if (!res.ok) throw new Error('Upload failed');
    const payload = await res.json();
    if (!payload?.ok || !payload?.src) throw new Error(payload?.error || 'Upload failed');
    return payload;
  }

  function openLegacyDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
      const req = indexedDB.open('joe-scene1-assets-v1', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Could not open legacy asset DB'));
    });
  }

  async function legacyAsset(assetId) {
    if (!assetId) return null;
    try {
      const db = await openLegacyDb();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction('images', 'readonly');
        const req = tx.objectStore('images').get(assetId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return record;
    } catch (_) { return null; }
  }

  async function migrateLegacyIndexedDbAssets() {
    let changed = false;
    for (const layer of Object.values(layout.layers)) {
      if (layer.type !== 'image' || layer.core || layer.src || !layer.assetId) continue;
      const record = await legacyAsset(layer.assetId);
      if (!record?.blob) continue;
      const upload = await uploadAsset(record.blob, layer.fileName || record.meta?.fileName || 'image.png');
      layer.src = upload.src;
      delete layer.assetId;
      changed = true;
    }
    if (changed) applyLayout();
    return changed;
  }

  async function addImageLayer(file, sceneId = 1) {
    if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file.');
    const id = uniqueId('image');
    const dims = await imageDimensions(file);
    const upload = await uploadAsset(file, file.name || 'image.png');
    const scene = validSceneId(sceneId, MIN_SCENE_ID);
    const stageEl = stageForScene(scene);
    const rect = stageEl?.getBoundingClientRect?.();
    const sceneW = (scene === 2 || scene === 3 || scene === 4) ? 1920 : (scene >= 5 ? Math.max(320, rect?.width || window.innerWidth) : DESIGN_W);
    const sceneH = (scene === 2 || scene === 3 || scene === 4) ? 1080 : (scene >= 5 ? Math.max(320, rect?.height || window.innerHeight) : DESIGN_H);
    const fitScale = Math.min(1, 520 / Math.max(1, dims.width), 520 / Math.max(1, dims.height));
    layout.layers[id] = normaliseLayer(id, {
      type: 'image', scene, core: false, name: file.name || 'Image', fileName: file.name || 'Image',
      src: upload.src, width: dims.width, height: dims.height, sourceWidth: dims.width, sourceHeight: dims.height,
      x: (sceneW - dims.width * fitScale) / 2,
      y: (sceneH - dims.height * fitScale) / 2,
      scale: fitScale, rotation: 0, opacity: 1, z: topZ(scene), visible: true, locked: false,
      imageStyle: defaultImageStyle()
    });
    compactLayerDepths();
    syncDynamicLayers();
    applyLayout();
    return id;
  }

  async function replaceBackground(file,sceneId=1){if(!file?.type?.startsWith('image/'))throw new Error('Please choose an image file.');const dims=await imageDimensions(file),upload=await uploadAsset(file,file.name||'background.png'),scene=validSceneId(sceneId,MIN_SCENE_ID),current=backgroundForScene(scene);layout.sceneBackgrounds[scene]={...current,src:upload.src,fileName:file.name||'Background',sourceWidth:dims.width,sourceHeight:dims.height};if(scene===1)layout.background={...layout.sceneBackgrounds[1]};applyBackground();return{...layout.sceneBackgrounds[scene]}}
  function setSceneVisible(sceneId,visible){const scene=validSceneId(sceneId,MIN_SCENE_ID);if(!layout.sceneVisibility||typeof layout.sceneVisibility!=='object')layout.sceneVisibility=normaliseSceneVisibility(null);layout.sceneVisibility[scene]=Boolean(visible);applySceneVisibility();return layout.sceneVisibility[scene]}

  async function replaceVideoLayer(id, file) {
    const layer = layout.layers[id];
    if (!layer || layer.type !== 'video') throw new Error('Video layer not found.');
    const type = String(file?.type || '').toLowerCase();
    if (!file || (!type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(file.name || ''))) {
      throw new Error('Please choose a video file.');
    }
    const dims = await videoDimensions(file);
    const upload = await uploadAsset(file, file.name || 'video.mp4');
    layer.src = upload.src;
    layer.fileName = file.name || 'Video';
    layer.sourceWidth = dims.width;
    layer.sourceHeight = dims.height;
    // A poster from the previous video would be misleading after replacement.
    layer.poster = '';
    applyLayer(id);
    const el = elementFor(id);
    if (el?.tagName === 'VIDEO') {
      el.pause?.();
      try { el.load(); el.currentTime = 0; } catch (_) {}
    }
    return { id, src: layer.src, width: dims.width, height: dims.height };
  }

  function detachMembers(ids) {
    const target = new Set(ids);
    for (const [bindingId, binding] of Object.entries(layout.bindings || {})) {
      binding.members = binding.members.filter(id => !target.has(id));
      if (binding.members.length < 2) delete layout.bindings[bindingId];
    }
  }

  function bindLayers(ids) {
    const members = [...new Set(ids)].filter(id => layout.layers[id]);
    if (members.length < 2) return null;
    const scenes = new Set(members.map(id => sceneOfLayer(layout.layers[id])));
    if (scenes.size !== 1) return null;
    detachMembers(members);
    const id = uniqueId('binding');
    layout.bindings[id] = { id, mode: 'absolute', name: `Binding ${Object.keys(layout.bindings).length + 1}`, members };
    return id;
  }

  function unbindLayers(ids) {
    const target = new Set(ids);
    let changed = false;
    for (const [bindingId, binding] of Object.entries(layout.bindings || {})) {
      if (binding.members.some(id => target.has(id))) {
        delete layout.bindings[bindingId];
        changed = true;
      }
    }
    return changed;
  }

  async function deleteAssetSource(src) {
    if (!src || !src.startsWith('uploads/')) return;
    try {
      await fetch(API_DELETE_ASSET, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src })
      });
    } catch (_) {}
  }

  async function removeLayer(id) {
    const layer = layout.layers[id];
    if (!layer) return false;
    // Every built-in layer is deletable. Core layers are tombstoned so Reset can restore them.
    detachMembers([id]);

    if (layer.core) {
      layout.deletedLayers = Array.isArray(layout.deletedLayers) ? layout.deletedLayers : [];
      if (!layout.deletedLayers.includes(id)) layout.deletedLayers.push(id);
      delete layout.layers[id];
      compactLayerDepths();
      applyLayout();
      return true;
    }

    // Keep uploaded assets on disk so the 20-step editor history can restore
    // a deleted image layer. Orphaned uploads can be cleaned manually later.
    stage.querySelector(`[data-layer-id="${CSS.escape(id)}"]`)?.remove();
    delete layout.layers[id];
    compactLayerDepths();
    applyLayout();
    return true;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Could not encode image'));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function exportProject() {
    const copy = compactLayoutForStorage(layout);
    const assets = {};
    const capture = async (key, src, fileName, kind = 'image') => {
      if (!String(src || '').startsWith('uploads/')) return;
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        const blob = await res.blob();
        assets[key] = { dataUrl: await blobToDataUrl(blob), fileName, kind };
      } catch (_) {}
    };
    for (const [id, layer] of Object.entries(copy.layers || {})) {
      await capture(id, layer.src, layer.fileName || layer.name || (layer.type === 'video' ? 'video.mp4' : 'image.png'), layer.type || 'image');
    }
    for(const scene of SCENE_IDS){const bg=copy.sceneBackgrounds?.[scene]||copy.sceneBackgrounds?.[String(scene)];await capture(`__background_scene_${scene}__`,bg?.src,bg?.fileName||`scene-${scene}-background.png`,'background')}
    return { format: 'joe-multiscene-project', version: 8, layout: copy, assets };
  }

  async function importProject(payload) {
    if ((payload?.format === 'joe-scene1-project' || payload?.format === 'joe-multiscene-project') && payload.layout) {
      const next = normaliseLayout(payload.layout);
      for (const [id, record] of Object.entries(payload.assets || {})) {
        if (!record?.dataUrl) continue;
        if(id==='__background__'){const upload=await uploadAsset(dataUrlToBlob(record.dataUrl),record.fileName||next.background?.fileName||'background.png');next.background.src=upload.src;next.sceneBackgrounds[1]={...(next.sceneBackgrounds[1]||next.background),src:upload.src};continue}
        const bgMatch=String(id).match(/^__background_scene_(-?\d+)__$/);if(bgMatch){const scene=Number(bgMatch[1]);if(!next.sceneBackgrounds?.[scene])continue;const upload=await uploadAsset(dataUrlToBlob(record.dataUrl),record.fileName||next.sceneBackgrounds[scene]?.fileName||`scene-${scene}-background.png`);next.sceneBackgrounds[scene].src=upload.src;if(scene===1)next.background={...next.sceneBackgrounds[1]};continue}
        const layer = next.layers[id];
        if (!layer) continue;
        const fallbackName = layer.type === 'video' ? 'video.mp4' : 'image.png';
        const mediaLayer = /** @type {import('../src/types').ImageLayer|import('../src/types').VideoLayer} */ (layer);
        const upload = await uploadAsset(dataUrlToBlob(record.dataUrl), record.fileName || mediaLayer.fileName || fallbackName);
        mediaLayer.src = upload.src;
      }
      layout = next;
    } else {
      layout = normaliseLayout(payload);
    }
    applyLayout();
    persistLayout();
  }

  function reset(persist = true) {
    layout = normaliseLayout(cloneDefault());
    applyLayout();
    if (persist) persistLayout();
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', updateScrollProgress, { passive: true });
  window.addEventListener('pointermove', updateLens, { passive: true });
  window.addEventListener('pointerleave', hideLens, { passive: true });
  document.documentElement.addEventListener('pointerleave', hideLens, { passive: true });
  document.addEventListener('pointerout', handleDocumentPointerExit, { passive: true, capture: true });
  document.addEventListener('mouseout', handleDocumentPointerExit, { passive: true, capture: true });
  window.addEventListener('joe-active-domain-change', /** @param {CustomEvent} event */ (event) => {
    textSceneEnteredAt = performance.now();
    const scene = Number(event.detail?.sceneId);
    const layers = Object.entries(layout.layers || {}).filter(([, layer]) => layer?.type === 'text' && Number(layer.scene) === scene);
    const delays = layers.flatMap(([, layer]) => [Number(layer.displayTiming?.enterDelayMs) || 0, Number(layer.displayTiming?.visibleForMs) || 0]).filter(value => value > 0);
    delays.forEach(delay => window.setTimeout(() => applyLayout(), delay + 8));
    if (Number(event.detail?.sceneId) !== 1) hideLens();
  });
  window.addEventListener('blur', hideLens, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hideLens(); }, { passive: true });

  star?.addEventListener('click', (e) => {
    if (editMode) { e.preventDefault(); return; }
    if (!domainOwnsScene(1)) { e.preventDefault(); return; }
    star.classList.toggle('is-active');
  });

  document.addEventListener('click', /** @param {MouseEvent} event */ (event) => {
    const textEl = /** @type {HTMLElement|null} */ (event.target instanceof Element ? event.target.closest('[data-layer-id]') : null);
    if (!textEl) return;
    const state = layout.layers[textEl.dataset.layerId];
    if (state && !domainOwnsScene(sceneOfLayer(state))) { event.preventDefault(); return; }
    const link = state?.type === 'text' ? state.link : null;
    if (!link || !String(link.href || '').trim()) return;
    if (editMode) { event.preventDefault(); return; }
    if (textEl.closest('a')) return; // Native/app navigation handles structural anchors.
    const href = String(link.href).trim();
    event.preventDefault();
    if (href.startsWith('#')) {
      const target = document.getElementById(href.slice(1));
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY + Number(link.offset || 0);
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
      return;
    }
    if (link.target === '_blank') window.open(href, '_blank', 'noopener,noreferrer');
    else location.href = href;
  }, true);

  document.addEventListener('keydown', /** @param {KeyboardEvent} event */ (event) => {
    if (editMode || (event.key !== 'Enter' && event.key !== ' ')) return;
    const textEl = /** @type {HTMLElement|null} */ (event.target instanceof Element ? event.target.closest('[data-layer-id].has-configured-link') : null);
    if (!textEl || textEl.closest('a')) return;
    const state = layout.layers[textEl.dataset.layerId];
    if (state && !domainOwnsScene(sceneOfLayer(state))) return;
    event.preventDefault();
    textEl.click();
  });

  window.SceneLanguage = {
    get language() { return /** @type {'zh'|'en'} */ (uiLanguage); },
    setLanguage: setUiLanguage
  };

  window.JoeSceneRuntime = window.Scene1 = {
    DESIGN_W, DESIGN_H, CHAR_W, CHAR_H, STORAGE_KEY, DEFAULT_LAYOUT,
    get layout() { return layout; },
    setLayout(next, persist = true) { layout = normaliseLayout(next); applyLayout(); if (persist) persistLayout(); },
    reset,
    applyLayer,
    applyLayout,
    persistLayout,
    flushLayout,
    cancelPendingSave,
    commitEditSession,
    discardEditSession,
    get previewMode() { return previewMode; },
    // Force all scroll-driven visual state to match the current scrollY. Used
    // after deterministic navigation finishes so Safari/Chrome cannot leave a
    // scene on a stale transition frame while waiting for a native scroll event.
    syncRuntimeScrollState() { updateScrollProgress(); },
    captureBackgroundPerspectiveBinding,
    applyBackgroundPerspectiveBinding,
    viewportToScene,
    scenePointToViewport,
    moveLayersToScene,
    captureViewportLocation,
    storeViewportLocation,
    switchViewMode,
    stageForScene,
    sceneOfLayer,
    getViewportTransform() { return { stageScale, stageLeft, stageTop }; },
    addTextLayer,
    addImageLayer,
    backgroundForScene,
    replaceBackground,
    setSceneVisible,
    replaceVideoLayer,
    removeLayer,
    bindLayers,
    unbindLayers,
    bindingForLayer,
    boundMembersFor,
    compactLayerDepths,
    layerRank,
    layerCount,
    moveLayerStep,
    moveLayerToRank,
    setEditorSelectionPriority,
    exportProject,
    importProject,
    compactLayoutForStorage,
    hydrateFromServer
  };

  applyLayout();
  resize();
  updateScrollProgress();
  // Re-run after layout settles so both video scenes are correctly armed on a normal top-of-page load.
  requestAnimationFrame(()=>{const story=window.__joeSimpleVideoStory;if(story?.active&&typeof story.onRuntimeScroll==='function')story.onRuntimeScroll();else Object.values(sceneControllers).forEach(controller=>controller?.onScroll?.())});
  hydrateFromServer();
})();
