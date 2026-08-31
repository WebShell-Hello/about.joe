(() => {
  'use strict';

  const registry = window.JoeScenes;
  const story = document.getElementById('story');
  const VIEW_MODE_KEY = 'joe-view-mode-v1';
  const VIEW_STATE_KEY = 'joe-view-state-v2';
  const UI_LANG_KEY = 'joe-ui-language-v1';
  const productionBuild = document.querySelector('meta[name="joe-build"]')?.content === 'production';
  const pageParams = new URLSearchParams(location.search);
  const configuredBuild = document.querySelector('meta[name="joe-build-id"]')?.content || '';
  const ASSET_BUILD = configuredBuild.startsWith('__') ? 'dev' : configuredBuild;
  const SCENE_ONE_BOOT_ASSETS = [
    'scenes/scene-1/assets/scene1-landscape-4k.webp',
    'scenes/scene-1/assets/character-main.webp',
    'scenes/scene-1/assets/Background%20perspective-2.webp',
    'scenes/scene-1/assets/Character%20perspective%20overlay-2.webp',
    'scenes/scene-1/assets/grass-2.webp',
    'scenes/scene-1/assets/grass1-2.webp',
    'scenes/scene-1/assets/grass2-2.webp',
    'scenes/scene-1/assets/grass-wireframe-a.webp',
    'scenes/scene-1/assets/grass-wireframe-b.webp',
    'scenes/scene-1/assets/grass-wireframe-c.webp'
  ];
  window.__joeAssetBuild = ASSET_BUILD;

  function ssGet(key) { try { return sessionStorage.getItem(key); } catch (_) { return null; } }
  function ssSet(key, value) { try { sessionStorage.setItem(key, value); } catch (_) {} }
  function ssRemove(key) { try { sessionStorage.removeItem(key); } catch (_) {} }

  // Migrate old share/bookmark URLs once, then keep the address clean.
  const legacyMode = pageParams.get('edit') === '1' ? 'edit' : (pageParams.get('preview') === '1' ? 'preview' : null);
  const legacyLang = pageParams.get('lang');
  const legacyScene = Number(pageParams.get('scene'));
  const legacyRel = Number(pageParams.get('rel'));
  const legacyPos = Number(pageParams.get('pos'));
  if (legacyMode && !productionBuild) ssSet(VIEW_MODE_KEY, legacyMode);
  if (productionBuild) ssRemove(VIEW_MODE_KEY);
  if (legacyLang === 'zh' || legacyLang === 'en') ssSet(UI_LANG_KEY, legacyLang);
  if (Number.isFinite(legacyScene) && Number.isFinite(legacyRel)) {
    ssSet(VIEW_STATE_KEY, JSON.stringify({ scene: legacyScene, rel: legacyRel, pending: true }));
  } else if (Number.isFinite(legacyPos) && legacyPos >= 0) {
    ssSet(VIEW_STATE_KEY, JSON.stringify({ pos: legacyPos, pending: true }));
  }
  if (location.search) history.replaceState({ ...(history.state || {}), cleanUrl: true }, '', location.pathname + location.hash);

  const viewMode = ssGet(VIEW_MODE_KEY) || 'normal';
  const editMode = !productionBuild && viewMode === 'edit';
  let pendingViewSnapshot = null;
  try { pendingViewSnapshot = JSON.parse(ssGet(VIEW_STATE_KEY) || 'null'); } catch (_) {}
  document.documentElement.classList.add('portfolio-booting');
  if (pendingViewSnapshot?.pending) document.documentElement.classList.add('restoring-view');

  function consumePendingView() {
    let state = null;
    try { state = JSON.parse(ssGet(VIEW_STATE_KEY) || 'null'); } catch (_) {}
    if (!state?.pending) return null;
    ssRemove(VIEW_STATE_KEY);
    return state;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${src}${src.includes('?') ? '&' : '?'}v=${ASSET_BUILD}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadSceneMarkup(entry) {
    const response = await fetch(entry.html, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${entry.name} markup returned HTTP ${response.status}`);
    return response.text();
  }

  function loadingCopy(state = 'loading') {
    const language = window.SceneLanguage?.language || ssGet(UI_LANG_KEY) || 'en';
    const copy = {
      loading: { en: 'Loading...', zh: '拼命加载中' },
      error: { en: 'Unable to load this scene', zh: '场景加载失败' }
    };
    return copy[state]?.[language === 'zh' ? 'zh' : 'en'] || copy.loading.en;
  }

  function setLoadingStatus(status, state) {
    if (!status) return;
    const copy = status.querySelector('[data-loading-status-copy]');
    if (copy && state !== 'ready') copy.textContent = loadingCopy(state);
    status.dataset.state = state;
    status.hidden = state === 'ready';
  }

  function createSceneLoadingStatus(root) {
    const status = document.createElement('div');
    status.className = 'scene-loading-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.innerHTML = '<span class="loading-status-spinner" aria-hidden="true"></span><span data-loading-status-copy></span>';
    root.appendChild(status);
    setLoadingStatus(status, 'loading');
    return status;
  }

  function waitForImage(image, timeoutMs = 12000) {
    if (image.complete) return Promise.resolve(image.naturalWidth > 0);
    return new Promise(resolve => {
      let settled = false;
      const finish = loaded => {
        if (settled) return;
        settled = true;
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        resolve(loaded);
      };
      const onLoad = () => finish(true);
      const onError = () => finish(false);
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      setTimeout(() => finish(false), timeoutMs);
    });
  }

  async function preloadImageAsset(source) {
    const image = new Image();
    image.decoding = 'async';
    image.src = ASSET_BUILD && ASSET_BUILD !== 'dev'
      ? `${source}${source.includes('?') ? '&' : '?'}v=${encodeURIComponent(ASSET_BUILD)}`
      : source;
    const loaded = await waitForImage(image, 30000);
    if (loaded && typeof image.decode === 'function') {
      try { await image.decode(); } catch (_) {}
    }
    return loaded;
  }

  function installSceneLoadingStates() {
    const siteStatus = document.getElementById('siteBootStatus');
    setLoadingStatus(siteStatus, 'loading');

    Promise.all(SCENE_ONE_BOOT_ASSETS.map(preloadImageAsset)).then(results => {
      document.documentElement.classList.add('scene-one-assets-ready');
      setLoadingStatus(siteStatus, results.every(Boolean) ? 'ready' : 'error');
    });

    [[2, 'sceneTwo'], [3, 'sceneThree'], [4, 'sceneFour']].forEach(([id, rootId]) => {
      const root = document.getElementById(rootId);
      const video = root?.querySelector('video');
      if (!root || !video) return;
      const status = createSceneLoadingStatus(root);
      const poster = video.poster;
      if (poster) {
        const image = new Image();
        image.onload = () => setLoadingStatus(status, 'ready');
        image.onerror = () => setLoadingStatus(status, 'error');
        image.src = poster;
      } else {
        setLoadingStatus(status, 'ready');
      }
      video.addEventListener('loadstart', () => setLoadingStatus(status, 'loading'));
      video.addEventListener('waiting', () => setLoadingStatus(status, 'loading'));
      video.addEventListener('stalled', () => setLoadingStatus(status, 'loading'));
      video.addEventListener('canplay', () => setLoadingStatus(status, 'ready'));
      video.addEventListener('playing', () => setLoadingStatus(status, 'ready'));
      video.addEventListener('error', () => setLoadingStatus(status, 'error'));
    });

    window.addEventListener('ui-language-change', () => {
      document.querySelectorAll('.site-boot-status:not([hidden]), .scene-loading-status:not([hidden])').forEach(status => {
        setLoadingStatus(status, status.dataset.state || 'loading');
      });
    });
  }

  // v44 — Scenes 2–5 share one visual stack, but interaction ownership is isolated per scene.
  // The shell always occupies exactly one viewport in document flow. While Scene 2–5
  // are story-locked, the inner stack is fixed to the viewport so trackpad momentum
  // can never visually push Scene 2 upward. Scene 6 remains the next ordinary page.
  function mountCinematicStack() {
    if (editMode || document.getElementById('cinematicStackShell')) return;
    const sceneIds = [2, 3, 4, 5];
    const roots = sceneIds.map(id => {
      const module = registry.get(id);
      return module?.rootId ? document.getElementById(module.rootId) : null;
    });
    if (roots.some(root => !root)) return;

    const shell = document.createElement('div');
    shell.id = 'cinematicStackShell';
    shell.className = 'cinematic-stack-shell';
    shell.setAttribute('aria-label', 'Cinematic scenes 2 to 5');

    const stack = document.createElement('div');
    stack.id = 'cinematicStack';
    stack.className = 'cinematic-stack';
    shell.appendChild(stack);

    roots[0].before(shell);
    roots.forEach((root, index) => {
      root.dataset.cinematicScene = String(sceneIds[index]);
      stack.appendChild(root);
    });

    // Posters provide the initial cinematic frames. Full videos are requested
    // only when navigation enters their scene, keeping Home bandwidth focused
    // on the first visible scene.
    roots.forEach(root => {
      root.querySelectorAll('video').forEach(video => {
        video.preload = 'none';
      });
    });
  }


  function initPortfolioNavigation() {
    const brand = document.getElementById('globalSiteBrand');
    const nav = document.getElementById('globalSiteNav');
    const storyEngine = window.__joeSimpleVideoStory;
    const navLinks = [brand, ...(nav?.querySelectorAll('[data-nav-scene]') || [])].filter(Boolean);
    const hashMap = new Map([
      ['#home', 1], ['#about', 2], ['#experience', 3], ['#skills', 4],
      ['#projects', 5], ['#blog', 6], ['#contact', 7]
    ]);

    const syncNavLabels = () => {
      const titles = window.Scene1?.layout?.sceneTitles || {};
      navLinks.forEach(link => {
        if (link === brand) return;
        const scene = Number(link.dataset.navScene);
        const title = titles[scene] || titles[String(scene)];
        const language = window.SceneLanguage?.language === 'zh' ? 'zh' : 'en';
        if (title) link.textContent = String(title[language] ?? title.en ?? link.textContent);
      });
    };

    const syncActive = sceneId => {
      const id = Number(sceneId) || 1;
      navLinks.forEach(link => {
        const active = Number(link.dataset.navScene) === id;
        link.classList.toggle('is-active', active);
        if (link !== brand) link.setAttribute('aria-current', active ? 'page' : 'false');
      });
    };

    const navigate = async sceneId => {
      if (editMode) return;
      const id = Number(sceneId);
      if (!Number.isFinite(id) || !storyEngine?.navigateToScene) return;
      syncActive(id);
      await storyEngine.navigateToScene(id, { autoplay: id >= 2 && id <= 4, reason: 'top-navigation' });
      syncActive(storyEngine.getActiveDomainId?.() || id);
    };

    navLinks.forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        if (editMode) return;
        navigate(Number(link.dataset.navScene) || 1);
      });
    });

    window.addEventListener('joe-active-domain-change', event => {
      syncActive(event.detail?.sceneId || 1);
    });
    window.addEventListener('scene-layout-applied', syncNavLabels);
    window.addEventListener('ui-language-change', syncNavLabels);

    // In Edit Mode, website navigation remains inert so every visible layer is editable.
    if (editMode) {
      document.addEventListener('click', event => {
        const link = event.target.closest?.('a');
        if (!link || link.closest('#editor')) return;
        event.preventDefault();
      }, true);
      return;
    }

    syncNavLabels();
    syncActive(storyEngine?.getActiveDomainId?.() || 1);

    // Optional direct-entry hashes are resolved once. The default remains Home.
    const requested = hashMap.get((location.hash || '').toLowerCase());
    if (requested && requested !== 1) {
      requestAnimationFrame(() => requestAnimationFrame(() => navigate(requested)));
    } else if (location.hash) {
      history.replaceState(history.state, '', location.pathname);
    }
  }

  async function boot() {
    try {
      const markup = await Promise.all(registry.manifest.map(loadSceneMarkup));
      story.innerHTML = markup.join('\n');
      installSceneLoadingStates();

      // Scene modules register their own DOM metadata, default layers and local behaviour.
      for (const entry of registry.manifest) await loadScript(entry.script);
      await loadScript('scenes/scene-1/digital-rain.js');
      mountCinematicStack();

      // Shared runtime is loaded only after every scene exists in the DOM.
      await loadScript('shared/runtime.js');
      if (productionBuild) document.getElementById('adminEntry')?.remove();
      else await loadScript('shared/editor.js');
      initPortfolioNavigation();
      document.documentElement.classList.add('scenes-ready');
      const requestedView = consumePendingView();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (requestedView) {
          const requestedScene = Number(requestedView.scene);
          const requestedRel = Number(requestedView.rel);
          const requestedOffsetPx = Number(requestedView.offsetPx);
          const requestedPos = Number(requestedView.pos);
          let restored = false;
          if (Number.isFinite(requestedScene) && registry.get(requestedScene) && Number.isFinite(requestedRel)) {
            const cinematicStory = window.__joeSimpleVideoStory;
            if (!editMode && cinematicStory?.navigateToScene) {
              cinematicStory.navigateToScene(requestedScene, { autoplay: false, reason: 'restore-view' });
              restored = true;
            } else {
              const module = registry.get(requestedScene);
              const target = module?.rootId ? document.getElementById(module.rootId) : null;
              if (target) {
                const rect = target.getBoundingClientRect();
                const targetTop = window.scrollY + rect.top;
                let y;
                if (requestedScene <= 4 && Number.isFinite(requestedOffsetPx)) {
                  const offset = Math.max(0, Math.min(window.innerHeight, requestedOffsetPx));
                  y = targetTop + offset - window.innerHeight * 0.5;
                } else {
                  const rel = Math.max(0, Math.min(1, requestedRel));
                  y = targetTop + rect.height * rel - window.innerHeight * 0.5;
                }
                window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
                restored = true;
              }
            }
          }
          if (!restored && Number.isFinite(requestedPos) && requestedPos >= 0) window.scrollTo({ top: requestedPos, behavior: 'auto' });
        }
        requestAnimationFrame(() => {
          document.documentElement.classList.remove('portfolio-booting', 'restoring-view');
          window.dispatchEvent(new CustomEvent('portfolio-scenes-visible'));
        });
      }));
    } catch (error) {
      console.error(error);
      document.documentElement.classList.remove('portfolio-booting', 'restoring-view');
      setLoadingStatus(document.getElementById('siteBootStatus'), 'error');
      story.innerHTML = `<div class="scene-load-error"><strong>Unable to load scenes.</strong><br>${String(error.message || error)}</div>`;
    }
  }

  boot();
})();
