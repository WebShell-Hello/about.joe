(() => {
  'use strict';

  const registry = window.JoeScenes;
  const story = document.getElementById('story');
  const VIEW_MODE_KEY = 'joe-view-mode-v1';
  const VIEW_STATE_KEY = 'joe-view-state-v2';
  const UI_LANG_KEY = 'joe-ui-language-v1';
  const productionBuild = document.querySelector('meta[name="joe-build"]')?.content === 'production';
  const pageParams = new URLSearchParams(location.search);
  const ASSET_BUILD = '68';

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

    // Request all cinematic media immediately. Scene 3/4 are decoded while the
    // user is still on Scene 2, so layer changes do not wait for network loading.
    const mobile = window.matchMedia?.('(pointer: coarse), (max-width: 820px)')?.matches;
    roots.forEach((root, index) => {
      root.querySelectorAll('video').forEach(video => {
        // Mobile Safari may terminate the tab when three 4K videos are
        // eagerly decoded. Keep only Scene 2 warm on touch-sized screens;
        // later chapters load when the user enters them.
        const eager = !mobile || index === 0;
        video.preload = eager ? 'auto' : 'metadata';
        if (eager) { try { video.load(); } catch (_) {} }
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

      // Scene modules register their own DOM metadata, default layers and local behaviour.
      for (const entry of registry.manifest) await loadScript(entry.script);
      await loadScript('scenes/scene-1/digital-rain.js');
      mountCinematicStack();

      // Shared runtime is loaded only after every scene exists in the DOM.
      await loadScript('shared/runtime.js');
      await loadScript('shared/editor.js');
      if (productionBuild) document.getElementById('adminEntry')?.remove();
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
      story.innerHTML = `<div class="scene-load-error"><strong>Unable to load scenes.</strong><br>${String(error.message || error)}</div>`;
    }
  }

  boot();
})();
