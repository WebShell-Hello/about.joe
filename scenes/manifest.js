(() => {
  'use strict';

  /** @typedef {import('../src/types').SceneDefinition} SceneDefinition */
  /** @typedef {import('../src/types').VideoController} VideoController */

  /** @type {Map<number, SceneDefinition>} */
  const modules = new Map();
  const manifest = [
    { id: 1, name: 'Scene 1', html: 'scenes/scene-1/scene.html', style: 'scenes/scene-1/scene.css', script: 'scenes/scene-1/scene.js' },
    { id: 2, name: 'Scene 2', html: 'scenes/scene-2/scene.html', style: 'scenes/scene-2/scene.css', script: 'scenes/scene-2/scene.js' },
    { id: 3, name: 'Scene 3', html: 'scenes/scene-3/scene.html', style: 'scenes/scene-3/scene.css', script: 'scenes/scene-3/scene.js' },
    { id: 4, name: 'Scene 4', html: 'scenes/scene-4/scene.html', style: 'scenes/scene-4/scene.css', script: 'scenes/scene-4/scene.js' },
    { id: 5, name: 'Scene 5', html: 'scenes/scene-5/scene.html', style: 'scenes/scene-5/scene.css', script: 'scenes/scene-5/scene.js' },
    { id: 6, name: 'Scene 6', html: 'scenes/scene-6/scene.html', style: 'scenes/scene-6/scene.css', script: 'scenes/scene-6/scene.js' },
    { id: 7, name: 'Scene 7', html: 'scenes/scene-7/scene.html', style: 'scenes/scene-7/scene.css', script: 'scenes/scene-7/scene.js' }
  ];

  window.JoeScenes = {
    manifest,
    /** @param {SceneDefinition} definition */
    register(definition) {
      if (!definition || !Number.isFinite(Number(definition.id))) throw new Error('A scene module must have a numeric id.');
      modules.set(Number(definition.id), definition);
      return definition;
    },
    get(id) { return modules.get(Number(id)) || null; },
    all() { return [...modules.values()].sort((a, b) => a.id - b.id); }
  };

  /*
   * v46 navigation-driven cinematic engine with strict per-scene Domain Isolation.
   *
   * Scene 2/3/4 interaction contract:
   * - Frame 1 + DOWN: start playback. Paused + DOWN: resume from the paused frame.
   * - While playing, DOWN is always swallowed; there is no scroll-to-skip path.
   * - Playing + UP: keep moving for the editable inertia delay, then pause. The
   *   rest of that same gesture is swallowed so it cannot immediately rewind.
   * - Paused + a NEW UP gesture: softly crossfade back to that same scene's frame 1.
   * - Scene 3/4 frame 1 + UP: softly crossfade exactly one chapter back to the
   *   previous scene's frame 1. One strong swipe still means one chapter only.
   * - Scene 2 frame 1 + UP: unlock the cinematic stack and restore Scene 1 native scroll.
   * - During every controlled return-to-frame-1 transition, both directions are locked
   *   and wheel/trackpad inertia is swallowed until the gesture tail is quiet.
   * - Natural playback end keeps the v40 real-tail-frame crossfade into the next frame 1.
   */

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
  const smoothstep = value => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  };

  function createStoryEngine(editMode) {
    const story = {
      active: !editMode,
      navigationDriven: true,
      manualCrossfades: true,
      navigationBusy: false,
      navigationToken: 0,
      navigationTargetId: 1,
      wheelGestureLocked: false,
      wheelGestureAccum: 0,
      wheelGestureTailTimer: 0,
      lastWheelEventAt: 0,
      wheelLockDirection: 0,
      wheelLockLastAbs: 0,
      wheelLockStartedAt: 0,
      touchStartX: 0,
      touchStartY: 0,
      touchGestureTriggered: false,
      controllers: new Map(),
      currentSceneId: 1,
      activeDomainId: 1,
      domainRevision: 0,
      stackLocked: false,
      lockedViewportHeight: 0,
      programmaticScroll: false,
      programmaticTimer: 0,
      playbackRaf: 0,
      transitionRaf: 0,
      transitionToken: 0,
      pauseTimer: 0,
      inputGuard: false,
      inputGuardTimer: 0,
      scene2EntryGuard: false,
      scene2EntryTimer: 0,
      releaseUpToScene1: false,
      releaseUpTimer: 0,
      scene2EntryLastDownAt: 0,
      scene2EntryArmedAt: 0,
      scene1EntrySnapTimer: 0,
      entryCommitRaf: 0,
      stackExitForward: false,
      lastRuntimeScrollY: 0,
      visuals: {
        videoOpacity: { 2: 1, 3: 0, 4: 0 },
        textOpacity: { 2: 0, 3: 0, 4: 0 },
        scene5ContentOpacity: 0
      },
      installed: false
    };

    const VIDEO_SCENES = [2, 3, 4];
    const CAPTION_FADE_IN_SECONDS = 0.8;
    const PREVIOUS_CAPTION_FADE_OUT_SECONDS = 1.0;
    const DEFAULT_VIDEO_CROSSFADE_MS = 300;
    const SCENE5_FADE_MS = 440;
    const DEFAULT_PAUSE_INERTIA_MS = 180;
    const RETURN_TO_START_FADE_MS = 300;
    const GESTURE_IDLE_MS = 280;
    const ENTRY_GESTURE_IDLE_MS = 150;
    const ENTRY_REVERSE_GAP_MS = 90;
    const SCENE1_ENTRY_SNAP_IDLE_MS = 90;

    const controllerFor = id => story.controllers.get(Number(id)) || null;

    // v44 Domain Isolation ---------------------------------------------------
    // Exactly one scene owns interaction at a time. Other scenes may render or
    // preload, but they cannot consume gestures, change playback state, or open
    // ready. Crossfades keep the source domain until the transition completes;
    // only then is ownership handed to the destination scene.
    function validDomainId(value) {
      const ids = manifest.map(entry => Number(entry.id)).filter(Number.isFinite);
      const min = ids.length ? Math.min(...ids) : 1;
      const max = ids.length ? Math.max(...ids) : 7;
      const id = Math.round(Number(value) || min);
      return Math.max(min, Math.min(max, id));
    }

    function isDomainActive(sceneId) {
      return validDomainId(sceneId) === story.activeDomainId;
    }

    function syncDomainClasses() {
      const active = story.activeDomainId;
      document.documentElement.dataset.activeDomain = `scene-${active}`;
      document.body.dataset.activeDomain = `scene-${active}`;
      for (const entry of manifest) {
        const root = rootFor(entry.id);
        if (!root) continue;
        const owns = entry.id === active;
        root.dataset.interactionDomain = `scene-${entry.id}`;
        root.dataset.domainActive = owns ? '1' : '0';
        root.classList.toggle('interaction-domain-active', owns);
        root.classList.toggle('interaction-domain-inactive', !owns);
      }
    }

    function setActiveDomain(sceneId, { syncCurrent = true, reason = '' } = {}) {
      const id = validDomainId(sceneId);
      const changed = story.activeDomainId !== id;
      story.activeDomainId = id;
      if (syncCurrent) story.currentSceneId = id;
      if (changed) story.domainRevision += 1;

      // An inactive video domain must never keep executing media state in the
      // background. Do not rewrite its phase here: transitions may intentionally
      // leave a source chapter in `transitioning`; just stop actual playback.
      for (const [videoId, controller] of story.controllers.entries()) {
        if (videoId === id) continue;
        try { controller.video.pause(); } catch (_) {}
        controller.pausePending = false;
        stopFinalFrameSampler(controller);
      }
      syncDomainClasses();
      syncStackSceneClasses();
      try {
        window.dispatchEvent(new CustomEvent('joe-active-domain-change', {
          detail: { sceneId: id, domain: `scene-${id}`, reason, revision: story.domainRevision }
        }));
      } catch (_) {}
      return id;
    }

    function rejectInactiveDomainInput(event) {
      if (event?.cancelable) event.preventDefault();
      return true;
    }

    function setReady(sceneId, ready) {
      const id = Number(sceneId);
      const controller = controllerFor(id);
      if (!controller) return;
      const next = Boolean(ready);
      // Only the active domain may open ready. Any domain may be explicitly
      // closed during a transition/reset.
      if (next && !isDomainActive(id)) return;
      controller.ready = next;
      if (controller.root) controller.root.dataset.cinematicReady = controller.ready ? '1' : '0';
    }

    function clearAllReady() {
      VIDEO_SCENES.forEach(id => setReady(id, false));
    }

    function transitionCrossfadeMs(sceneId) {
      const id = Number(sceneId);
      const layout = window.JoeSceneRuntime?.layout;
      const transition = layout?.sceneTransitions?.[id] || layout?.sceneTransitions?.[String(id)] || {};
      const fallback = id === 4 ? SCENE5_FADE_MS : DEFAULT_VIDEO_CROSSFADE_MS;
      return Math.max(0, Math.min(3000, Number(transition.crossfadeMs ?? fallback) || 0));
    }

    function pauseInertiaMs() {
      const value = window.JoeSceneRuntime?.layout?.cinematicSettings?.pauseInertiaMs;
      return Math.max(0, Math.min(1200, Number(value ?? DEFAULT_PAUSE_INERTIA_MS) || 0));
    }

    function rootFor(id) {
      const module = window.JoeScenes?.get(Number(id));
      return module?.rootId ? document.getElementById(module.rootId) : null;
    }

    function stackRoot() { return document.getElementById('cinematicStack'); }
    function stackShellRoot() { return document.getElementById('cinematicStackShell'); }

    function stackStartY() {
      const shell = stackShellRoot();
      if (shell) return Math.max(0, window.scrollY + shell.getBoundingClientRect().top);
      const stack = stackRoot();
      if (stack && !story.stackLocked) return Math.max(0, window.scrollY + stack.getBoundingClientRect().top);
      const root = rootFor(2);
      return root ? Math.max(0, window.scrollY + root.getBoundingClientRect().top) : 0;
    }

    function setStackExitForward(active) {
      const next = Boolean(active);
      story.stackExitForward = next;
      document.body.classList.toggle('cinematic-stack-exiting', next);
      stackRoot()?.classList.toggle('is-exiting-forward', next);
    }

    function setStackLocked(locked) {
      const next = Boolean(locked);
      const wasLocked = story.stackLocked;
      const stack = stackRoot();
      if (next) setStackExitForward(false);
      if (next && (!wasLocked || !story.lockedViewportHeight)) {
        // Capture ONCE when the stack locks. Repeated wheel/scroll callbacks must
        // not recapture a transient Safari viewport value.
        story.lockedViewportHeight = Math.max(1, window.innerHeight);
        stack?.style.setProperty('--cinematic-locked-height', `${story.lockedViewportHeight}px`);
      }
      story.stackLocked = next;
      if (!next) story.lockedViewportHeight = 0;
      stack?.classList.toggle('is-locked', next);
      document.body.classList.toggle('cinematic-stack-locked', next);
      document.documentElement.classList.toggle('cinematic-scroll-locked', next);
    }

    // v43: visual-first Scene 1 → 2 commit. The old sequence scrolled the
    // document to the shell before the fixed stack class was applied. Under a
    // high-momentum compositor frame Safari/Chrome could paint that intermediate
    // state: Scene 1 above + Scene 2 below. We now pin the stack to the viewport
    // and hide Scene 1 FIRST, then correct the underlying scroll position, then
    // promote the temporary lock into the normal hard-lock state.
    function commitStackAtStart(startY) {
      const stack = stackRoot();
      if (!stack) return;
      const targetY = Math.max(0, Number(startY) || 0);
      story.lockedViewportHeight = Math.max(1, window.innerHeight);
      stack.style.setProperty('--cinematic-locked-height', `${story.lockedViewportHeight}px`);
      stack.classList.add('is-entry-committing');
      document.body.classList.add('cinematic-entry-committing');

      // Correct scroll while the root is still scrollable. The temporary fixed
      // layer already covers the viewport, so this cannot expose a split frame.
      jumpScrollTo(targetY);
      setStackLocked(true);

      if (story.entryCommitRaf) cancelAnimationFrame(story.entryCommitRaf);
      story.entryCommitRaf = requestAnimationFrame(() => {
        story.entryCommitRaf = 0;
        stack.classList.remove('is-entry-committing');
        document.body.classList.remove('cinematic-entry-committing');
      });
    }

    function sceneStartY(id) {
      const sceneId = Number(id);
      if ([2, 3, 4, 5].includes(sceneId) && stackRoot()) return stackStartY();
      const root = rootFor(sceneId);
      if (!root) return 0;
      return Math.max(0, window.scrollY + root.getBoundingClientRect().top);
    }

    function sceneAtScroll(y = window.scrollY) {
      const scrollY = Math.max(0, Number(y) || 0);
      const start = stackStartY();
      if (scrollY < start - 2) return 1;
      if (story.stackLocked && story.currentSceneId >= 2 && story.currentSceneId <= 5) return story.currentSceneId;
      const scene6Root = rootFor(6);
      if (scene6Root) {
        const scene6Start = Math.max(0, window.scrollY + scene6Root.getBoundingClientRect().top);
        if (scrollY >= scene6Start - 2) return 6;
      }
      if (story.currentSceneId === 5 || story.currentSceneId === 6) return story.currentSceneId;
      if (story.currentSceneId >= 2 && story.currentSceneId <= 4) return story.currentSceneId;
      return 2;
    }

    function syncStackSceneClasses() {
      for (const id of [2, 3, 4, 5]) {
        const root = rootFor(id);
        if (!root) continue;
        root.classList.toggle('cinematic-scene-active', id === story.currentSceneId);
        root.classList.toggle('cinematic-scene-past', id < story.currentSceneId);
        root.classList.toggle('cinematic-scene-future', id > story.currentSceneId);
      }
      document.body.classList.toggle('cinematic-stack-active', story.currentSceneId >= 2 && story.currentSceneId <= 5);
    }

    function stopPlaybackLoop() {
      if (story.playbackRaf) cancelAnimationFrame(story.playbackRaf);
      story.playbackRaf = 0;
    }

    function stopTransition() {
      story.transitionToken += 1;
      if (story.transitionRaf) cancelAnimationFrame(story.transitionRaf);
      story.transitionRaf = 0;
    }

    function clearPauseTimer() {
      if (story.pauseTimer) clearTimeout(story.pauseTimer);
      story.pauseTimer = 0;
      for (const controller of story.controllers.values()) controller.pausePending = false;
    }

    function stopFinalFrameSampler(controller) {
      if (!controller?.video || !controller.frameCallbackId) return;
      try { controller.video.cancelVideoFrameCallback?.(controller.frameCallbackId); } catch (_) {}
      controller.frameCallbackId = 0;
    }

    function pauseAllVideos(exceptId = null) {
      for (const [id, controller] of story.controllers.entries()) {
        if (id === exceptId) continue;
        try { controller.video.pause(); } catch (_) {}
        stopFinalFrameSampler(controller);
        controller.pausePending = false;
        if (controller.phase === 'playing') {
          if (controller.captionStartedAt > 0) controller.captionElapsedMs = Math.max(0, performance.now() - controller.captionStartedAt);
          controller.captionStartedAt = 0;
          controller.phase = 'paused';
        }
      }
    }

    function endHoldTime(video) {
      const duration = Number(video?.duration);
      return Number.isFinite(duration) && duration > 0 ? Math.max(0, duration - 0.003) : 0;
    }

    function setVideoFirstFrame(id) {
      const controller = controllerFor(id);
      if (!controller) return;
      clearFrozenFinalFrame(controller);
      controller.finalFrameMediaTime = NaN;
      controller.pausePending = false;
      try { controller.video.pause(); } catch (_) {}
      try { controller.video.currentTime = 0; } catch (_) {}
      controller.captionStartedAt = 0;
      controller.captionElapsedMs = 0;
      controller.phase = 'hold-start';
      setReady(id, false);
    }

    function firstFrameVisualTarget(sceneId) {
      const id = Number(sceneId);
      return {
        videoOpacity: { 2: id === 2 ? 1 : 0, 3: id === 3 ? 1 : 0, 4: id === 4 ? 1 : 0 },
        // The active chapter's text is visible from its first frame. Per-layer
        // displayTiming in the runtime controls any intentional delay.
        textOpacity: { 2: id === 2 ? 1 : 0, 3: id === 3 ? 1 : 0, 4: id === 4 ? 1 : 0 },
        scene5ContentOpacity: id === 5 ? 1 : 0
      };
    }

    function navigationFirstFrameTarget(sceneId, carryPreviousCaption = false) {
      const target = firstFrameVisualTarget(sceneId);
      const id = Number(sceneId);
      // Every chapter starts clean: never carry the previous chapter's text
      // into Scene 3 or Scene 4, even during a sequential wheel transition.
      if (id === 3) target.textOpacity[2] = 0;
      if (id === 4) target.textOpacity[3] = 0;
      return target;
    }

    function snapshotVisuals() {
      return {
        videoOpacity: { ...story.visuals.videoOpacity },
        textOpacity: { ...story.visuals.textOpacity },
        scene5ContentOpacity: Number(story.visuals.scene5ContentOpacity) || 0
      };
    }

    function assignVisualTarget(target) {
      for (const id of VIDEO_SCENES) {
        story.visuals.videoOpacity[id] = clamp01(target.videoOpacity[id]);
        story.visuals.textOpacity[id] = clamp01(target.textOpacity[id]);
      }
      story.visuals.scene5ContentOpacity = clamp01(target.scene5ContentOpacity);
    }

    function interpolateVisuals(start, target, progress) {
      const p = clamp01(progress);
      for (const id of VIDEO_SCENES) {
        story.visuals.videoOpacity[id] = clamp01(start.videoOpacity[id] + (target.videoOpacity[id] - start.videoOpacity[id]) * p);
        story.visuals.textOpacity[id] = clamp01(start.textOpacity[id] + (target.textOpacity[id] - start.textOpacity[id]) * p);
      }
      story.visuals.scene5ContentOpacity = clamp01(start.scene5ContentOpacity + (target.scene5ContentOpacity - start.scene5ContentOpacity) * p);
    }

    function applySceneLayers(sceneId) {
      const runtime = window.JoeSceneRuntime;
      const layout = runtime?.layout;
      if (runtime?.applyLayer && layout?.layers) {
        for (const [layerId, layer] of Object.entries(layout.layers)) {
          if (Number(layer?.scene) === Number(sceneId)) runtime.applyLayer(layerId);
        }
        return;
      }
      const controller = controllerFor(sceneId);
      if (controller) controller.video.style.opacity = String(story.visuals.videoOpacity[sceneId] ?? 1);
      const root = rootFor(sceneId);
      root?.querySelectorAll('[data-layer-id]').forEach(el => {
        if (el.tagName === 'VIDEO') return;
        /** @type {HTMLElement} */ (el).style.opacity = String(story.visuals.textOpacity[sceneId] ?? 1);
      });
    }

    function applyVisuals(...sceneIds) {
      const ids = sceneIds.length ? [...new Set(sceneIds.map(Number))] : [2, 3, 4, 5];
      ids.forEach(applySceneLayers);
      syncStackSceneClasses();
    }

    story.getLayerOpacityMultiplier = function getLayerOpacityMultiplier(layer) {
      if (!story.active || !layer) return 1;
      const scene = Number(layer.scene);
      if (layer.type === 'video' && VIDEO_SCENES.includes(scene)) return clamp01(story.visuals.videoOpacity[scene] ?? 1);
      if (layer.type === 'text' && VIDEO_SCENES.includes(scene)) return clamp01(story.visuals.textOpacity[scene] ?? 0);
      if (scene === 5) return clamp01(story.visuals.scene5ContentOpacity ?? 0);
      return 1;
    };

    function markProgrammaticScroll() {
      story.programmaticScroll = true;
      if (story.programmaticTimer) clearTimeout(story.programmaticTimer);
      story.programmaticTimer = setTimeout(() => {
        story.programmaticTimer = 0;
        story.programmaticScroll = false;
      }, 90);
    }

    function jumpScrollTo(y) {
      markProgrammaticScroll();
      const html = document.documentElement;
      const old = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, Number(y) || 0));
      html.style.scrollBehavior = old;
    }

    function resetAllPlaybackPhases() {
      stopPlaybackLoop();
      stopTransition();
      clearPauseTimer();
      pauseAllVideos();
    }

    function presetFirstFrame(sceneId) {
      const id = Number(sceneId);
      resetAllPlaybackPhases();
      const target = firstFrameVisualTarget(id);
      assignVisualTarget(target);
      VIDEO_SCENES.forEach(videoScene => setVideoFirstFrame(videoScene));
      clearAllReady();
      setActiveDomain(id, { reason: 'preset-first-frame' });
      applyVisuals(2, 3, 4, 5);
    }

    function jumpToSceneFirstFrame(sceneId, { guardScene2 = false } = {}) {
      const id = Number(sceneId);
      const cinematic = [2, 3, 4, 5].includes(id);
      // Measure the shell BEFORE fixing the inner stack.
      const cinematicStart = cinematic ? stackStartY() : 0;
      presetFirstFrame(id);
      if (cinematic) {
        if (id === 2) commitStackAtStart(cinematicStart);
        else {
          jumpScrollTo(cinematicStart);
          setStackLocked(true);
        }
      } else {
        setStackLocked(false);
        jumpScrollTo(sceneStartY(id));
      }
      requestAnimationFrame(() => applyVisuals(2, 3, 4, 5));
      if (id === 2 && guardScene2) armScene2EntryGuard();
    }

    function prepareNextFrameUnderCurrent(currentId) {
      const nextId = Number(currentId) + 1;
      if (nextId <= 4) {
        setVideoFirstFrame(nextId);
        story.visuals.videoOpacity[nextId] = 0;
        story.visuals.textOpacity[nextId] = 0;
      } else if (nextId === 5) {
        story.visuals.scene5ContentOpacity = 0;
      }
      applyVisuals(nextId);
    }

    function captureEndingFrame(controller) {
      if (!controller?.video) return null;
      const video = controller.video;
      if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return controller.finalFrameCanvas || null;
      let canvas = controller.finalFrameCanvas;
      if (!canvas) {
        canvas = document.createElement('canvas');
        controller.finalFrameCanvas = canvas;
      }
      if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
      if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
      try {
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        controller.finalFrameMediaTime = Number(video.currentTime) || 0;
        return canvas;
      } catch (_) {
        return controller.finalFrameCanvas || null;
      }
    }

    function startFinalFrameSampler(controller) {
      stopFinalFrameSampler(controller);
      const video = controller?.video;
      if (!video || typeof video.requestVideoFrameCallback !== 'function') return;
      const sample = (_now, metadata) => {
        if (controller.phase !== 'playing' || controller.pausePending) {
          controller.frameCallbackId = 0;
          return;
        }
        const duration = Number(video.duration);
        const mediaTime = Number(metadata?.mediaTime ?? video.currentTime) || 0;
        if (Number.isFinite(duration) && duration > 0 && duration - mediaTime <= 0.22) captureEndingFrame(controller);
        controller.frameCallbackId = video.requestVideoFrameCallback(sample);
      };
      controller.frameCallbackId = video.requestVideoFrameCallback(sample);
    }

    function mountFrozenFinalFrame(controller) {
      const video = controller?.video;
      if (!video) return null;
      // Prefer the last frame captured while it was actually presented. Do not
      // redraw after `ended`, because Safari may already have switched paint state.
      const canvas = controller.finalFrameCanvas || captureEndingFrame(controller);
      if (!canvas) return null;
      if (canvas.isConnected) canvas.remove();
      canvas.className = `${video.className || ''} cinematic-frozen-frame`.trim();
      canvas.removeAttribute('data-layer-id');
      canvas.removeAttribute('id');
      canvas.style.cssText = video.style.cssText;
      canvas.style.pointerEvents = 'none';
      canvas.style.opacity = '1';
      video.insertAdjacentElement('afterend', canvas);
      controller.mountedFinalFrame = canvas;
      return canvas;
    }

    function clearFrozenFinalFrame(controller) {
      const canvas = controller?.mountedFinalFrame || controller?.finalFrameCanvas;
      if (canvas?.isConnected) canvas.remove();
      if (controller) controller.mountedFinalFrame = null;
    }

    function createFirstFrameOverlay(controller) {
      const video = controller?.video;
      if (!video) return null;
      const poster = video.getAttribute('poster') || video.poster || '';
      if (!poster) return null;
      const image = document.createElement('img');
      image.src = poster;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.className = `${video.className || ''} cinematic-first-frame`.trim();
      image.style.cssText = video.style.cssText;
      image.style.pointerEvents = 'none';
      image.style.userSelect = 'none';
      image.style.opacity = '0';
      image.removeAttribute('data-layer-id');
      image.removeAttribute('id');
      video.insertAdjacentElement('afterend', image);
      controller.firstFrameOverlay = image;
      return image;
    }

    function removeFirstFrameOverlay(controller) {
      const overlay = controller?.firstFrameOverlay;
      if (overlay?.isConnected) overlay.remove();
      if (controller) controller.firstFrameOverlay = null;
    }

    function waitForImage(image, timeoutMs = 450) {
      if (!image || image.complete) return Promise.resolve();
      return new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          image.removeEventListener('load', finish);
          image.removeEventListener('error', finish);
          resolve();
        };
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', finish, { once: true });
        setTimeout(finish, timeoutMs);
      });
    }

    function seekFirstFrame(controller, timeoutMs = 500) {
      if (!controller?.video) return Promise.resolve();
      const video = controller.video;
      try { video.pause(); } catch (_) {}
      return new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener('seeked', finish);
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        };
        video.addEventListener('seeked', finish, { once: true });
        try {
          if (Math.abs(Number(video.currentTime) || 0) <= 0.001 && video.readyState >= 2) finish();
          else video.currentTime = 0;
        } catch (_) { finish(); }
        setTimeout(finish, timeoutMs);
      });
    }

    function animateVisual(duration, onFrame, onComplete) {
      stopTransition();
      const token = story.transitionToken;
      const start = performance.now();
      const step = now => {
        if (token !== story.transitionToken) return;
        const p = clamp01((now - start) / Math.max(1, duration));
        const eased = smoothstep(p);
        onFrame?.(eased, p);
        if (p >= 1) {
          story.transitionRaf = 0;
          onComplete?.();
          return;
        }
        story.transitionRaf = requestAnimationFrame(step);
      };
      story.transitionRaf = requestAnimationFrame(step);
    }

    function armInputGuard(minMs = GESTURE_IDLE_MS + 120) {
      story.inputGuard = true;
      if (story.inputGuardTimer) clearTimeout(story.inputGuardTimer);
      story.inputGuardTimer = setTimeout(() => {
        story.inputGuardTimer = 0;
        story.inputGuard = false;
      }, Math.max(GESTURE_IDLE_MS + 80, Number(minMs) || 0));
    }

    function extendInputGuard() {
      if (!story.inputGuard) return;
      if (story.inputGuardTimer) clearTimeout(story.inputGuardTimer);
      story.inputGuardTimer = setTimeout(() => {
        story.inputGuardTimer = 0;
        story.inputGuard = false;
      }, GESTURE_IDLE_MS + 180);
    }

    function clearScene1EntrySnap() {
      if (story.scene1EntrySnapTimer) clearTimeout(story.scene1EntrySnapTimer);
      story.scene1EntrySnapTimer = 0;
    }

    function armScene1EntrySnap() {
      clearScene1EntrySnap();
      story.scene1EntrySnapTimer = setTimeout(() => {
        story.scene1EntrySnapTimer = 0;
        if (!story.active || story.currentSceneId !== 1 || story.programmaticScroll) return;
        const shell = stackShellRoot();
        if (!shell) return;
        const rect = shell.getBoundingClientRect();
        // If Scene 2 is already visible at the bottom and the gesture has gone
        // quiet, never leave the document parked in a half Scene1 / half Scene2
        // composition. Finish the page turn and hard-lock Scene 2 full-screen.
        if (rect.top < window.innerHeight - 1 && rect.top > 1) {
          jumpToSceneFirstFrame(2, { guardScene2: true });
        }
      }, SCENE1_ENTRY_SNAP_IDLE_MS);
    }

    function clearScene2EntryGuard() {
      story.scene2EntryGuard = false;
      story.scene2EntryLastDownAt = 0;
      story.scene2EntryArmedAt = 0;
      if (story.scene2EntryTimer) clearTimeout(story.scene2EntryTimer);
      story.scene2EntryTimer = 0;
    }

    function armScene2EntryGuard() {
      story.scene2EntryGuard = true;
      story.scene2EntryArmedAt = performance.now();
      story.scene2EntryLastDownAt = story.scene2EntryArmedAt;
      if (story.scene2EntryTimer) clearTimeout(story.scene2EntryTimer);
      story.scene2EntryTimer = setTimeout(clearScene2EntryGuard, ENTRY_GESTURE_IDLE_MS);
    }

    function extendScene2EntryGuard() {
      if (!story.scene2EntryGuard) return;
      story.scene2EntryLastDownAt = performance.now();
      if (story.scene2EntryTimer) clearTimeout(story.scene2EntryTimer);
      story.scene2EntryTimer = setTimeout(clearScene2EntryGuard, ENTRY_GESTURE_IDLE_MS);
    }

    function armScene1Release() {
      story.releaseUpToScene1 = true;
      setStackLocked(false);
      if (story.releaseUpTimer) clearTimeout(story.releaseUpTimer);
      story.releaseUpTimer = setTimeout(() => {
        story.releaseUpTimer = 0;
        story.releaseUpToScene1 = false;
      }, GESTURE_IDLE_MS + 180);
    }

    function extendScene1Release() {
      if (!story.releaseUpToScene1) return;
      if (story.releaseUpTimer) clearTimeout(story.releaseUpTimer);
      story.releaseUpTimer = setTimeout(() => {
        story.releaseUpTimer = 0;
        story.releaseUpToScene1 = false;
      }, GESTURE_IDLE_MS + 180);
    }

    function completeNatural(sceneId) {
      const id = Number(sceneId);
      const controller = controllerFor(id);
      if (!controller || !isDomainActive(id) || controller.phase === 'transitioning' || controller.phase === 'returning') return;
      stopPlaybackLoop();
      stopFinalFrameSampler(controller);
      clearPauseTimer();
      try { controller.video.pause(); } catch (_) {}
      controller.captionElapsedMs = controller.captionStartedAt > 0
        ? Math.max(0, performance.now() - controller.captionStartedAt)
        : controller.captionElapsedMs;
      controller.captionStartedAt = 0;
      controller.phase = 'hold-end';
      controller.pausePending = false;
      setReady(id, false);

      // v52 — a video chapter ending is no longer a navigation action.
      // Scene 2/3/4 stays authoritative on its own final presented frame until
      // the user performs the next discrete wheel/touch/nav action. This keeps
      // one physical gesture equal to exactly one chapter change.
      if (id === 2 || id === 3) story.visuals.textOpacity[id] = 1;
      if (id === 4) story.visuals.textOpacity[3] = 0;

      setStackLocked(true);
      jumpScrollTo(stackStartY());
      story.navigationTargetId = id;

      // Safari may stop painting the decoded final video frame after `ended`.
      // Keep the already-sampled final frame mounted as a still image. If a
      // canvas is unavailable, explicitly seek to the last decodable instant.
      const frozen = mountFrozenFinalFrame(controller);
      if (frozen) {
        frozen.style.opacity = '1';
        story.visuals.videoOpacity[id] = 0;
      } else {
        try { controller.video.currentTime = endHoldTime(controller.video); } catch (_) {}
        story.visuals.videoOpacity[id] = 1;
      }

      // Nothing from the next chapter is revealed automatically at video end.
      if (id < 4) story.visuals.videoOpacity[id + 1] = 0;
      if (id === 4) story.visuals.scene5ContentOpacity = 0;
      applyVisuals(2, 3, 4, 5);
      restoreNavigationInput({ clearWheel: true });
    }

    function updateCaptionTimeline(sceneId, elapsedSeconds) {
      const t = Math.max(0, Number(elapsedSeconds) || 0);
      if (sceneId === 2) {
        story.visuals.textOpacity[2] = 1;
        applyVisuals(2);
        return;
      }
      if (sceneId === 3) {
        story.visuals.textOpacity[2] = 0;
        story.visuals.textOpacity[3] = 1;
        applyVisuals(2, 3);
        return;
      }
      if (sceneId === 4) {
        story.visuals.textOpacity[3] = 0;
        story.visuals.textOpacity[4] = 1;
        applyVisuals(3, 4);
      }
    }

    function playbackFrame(sceneId) {
      story.playbackRaf = 0;
      const controller = controllerFor(sceneId);
      if (!controller || !isDomainActive(sceneId) || controller.phase !== 'playing') return;
      const video = controller.video;
      const now = performance.now();
      const elapsedMs = controller.captionStartedAt > 0 ? Math.max(0, now - controller.captionStartedAt) : 0;
      controller.captionElapsedMs = elapsedMs;
      updateCaptionTimeline(sceneId, elapsedMs / 1000);
      if (typeof video.requestVideoFrameCallback !== 'function' && Number.isFinite(video.duration) && video.duration > 0 && video.duration - video.currentTime <= 0.20) {
        if (!Number.isFinite(controller.finalFrameMediaTime) || Math.abs(video.currentTime - controller.finalFrameMediaTime) >= 0.01) captureEndingFrame(controller);
      }
      if (video.ended) {
        completeNatural(sceneId);
        return;
      }
      story.playbackRaf = requestAnimationFrame(() => playbackFrame(sceneId));
    }

    function startVideo(sceneId) {
      const id = Number(sceneId);
      const controller = controllerFor(id);
      if (!controller || !VIDEO_SCENES.includes(id) || !isDomainActive(id) || controller.phase === 'playing' || controller.phase === 'transitioning' || controller.phase === 'returning') return;
      clearFrozenFinalFrame(controller);
      removeFirstFrameOverlay(controller);
      controller.finalFrameMediaTime = NaN;
      controller.pausePending = false;
      clearPauseTimer();
      stopTransition();
      pauseAllVideos(id);
      setStackLocked(true);
      if (Math.abs(window.scrollY - stackStartY()) > 1) jumpScrollTo(stackStartY());
      story.currentSceneId = id;
      story.visuals.videoOpacity[id] = 1;
      setReady(id, true);
      controller.phase = 'playing';
      controller.captionStartedAt = performance.now() - Math.max(0, Number(controller.captionElapsedMs) || 0);
      updateCaptionTimeline(id, Math.max(0, Number(controller.captionElapsedMs) || 0) / 1000);
      // v45 domain isolation: Scene 2 must never re-apply Scene 1 layers when
      // playback starts. Scene 3/4 may update the previous cinematic caption,
      // but Scene 1 is outside the cinematic domain and stays untouched.
      if (id === 2) applyVisuals(2);
      else applyVisuals(id, id - 1);

      const promise = controller.video.play();
      const beginLoop = () => {
        if (controller.phase !== 'playing') return;
        stopPlaybackLoop();
        startFinalFrameSampler(controller);
        story.playbackRaf = requestAnimationFrame(() => playbackFrame(id));
      };
      if (promise?.then) {
        promise.then(beginLoop).catch(() => {
          controller.captionElapsedMs = controller.captionStartedAt > 0 ? Math.max(0, performance.now() - controller.captionStartedAt) : 0;
          controller.captionStartedAt = 0;
          controller.phase = controller.video.currentTime > 0 ? 'paused' : 'hold-start';
          setReady(id, controller.phase === 'paused');
          stopPlaybackLoop();
          stopFinalFrameSampler(controller);
        });
      } else beginLoop();
    }

    function requestInertiaPause(sceneId) {
      const controller = controllerFor(sceneId);
      if (!controller || !isDomainActive(sceneId) || controller.phase !== 'playing' || controller.pausePending) return;
      controller.pausePending = true;
      const delay = pauseInertiaMs();
      armInputGuard(delay + GESTURE_IDLE_MS + 160);
      if (story.pauseTimer) clearTimeout(story.pauseTimer);
      story.pauseTimer = setTimeout(() => {
        story.pauseTimer = 0;
        if (!controller.pausePending || controller.phase !== 'playing') return;
        controller.pausePending = false;
        try { controller.video.pause(); } catch (_) {}
        stopPlaybackLoop();
        stopFinalFrameSampler(controller);
        if (controller.captionStartedAt > 0) controller.captionElapsedMs = Math.max(0, performance.now() - controller.captionStartedAt);
        controller.captionStartedAt = 0;
        controller.phase = 'paused';
        updateCaptionTimeline(sceneId, controller.captionElapsedMs / 1000);
      }, delay);
    }

    async function returnCurrentToFirstFrame(sceneId) {
      const id = Number(sceneId);
      const controller = controllerFor(id);
      if (!controller || !isDomainActive(id) || controller.phase !== 'paused') return;
      clearPauseTimer();
      stopPlaybackLoop();
      stopFinalFrameSampler(controller);
      stopTransition();
      try { controller.video.pause(); } catch (_) {}
      controller.phase = 'returning';
      setReady(id, false);
      setStackLocked(true);
      jumpScrollTo(stackStartY());
      story.currentSceneId = id;
      const duration = RETURN_TO_START_FADE_MS;
      armInputGuard(duration + GESTURE_IDLE_MS + 180);

      const overlay = createFirstFrameOverlay(controller);
      await waitForImage(overlay);
      if (controller.phase !== 'returning') { removeFirstFrameOverlay(controller); return; }
      const start = snapshotVisuals();
      const target = firstFrameVisualTarget(id);

      animateVisual(duration, eased => {
        interpolateVisuals(start, target, eased);
        // Keep the actual paused frame fading away while the poster/first-frame
        // image fades in above it. This avoids a visible seek on Safari/Chrome.
        story.visuals.videoOpacity[id] = clamp01((start.videoOpacity[id] ?? 1) * (1 - eased));
        if (overlay) overlay.style.opacity = String(eased);
        applyVisuals(2, 3, 4, 5);
      }, async () => {
        await seekFirstFrame(controller);
        controller.captionStartedAt = 0;
        controller.captionElapsedMs = 0;
        controller.pausePending = false;
        controller.phase = 'hold-start';
        assignVisualTarget(target);
        setActiveDomain(id, { reason: 'return-current-to-first' });
        applyVisuals(2, 3, 4, 5);
        // Require a genuinely new gesture after the return completes. Any tail
        // events from the initiating strong swipe are swallowed.
        armInputGuard(GESTURE_IDLE_MS + 180);
        requestAnimationFrame(() => requestAnimationFrame(() => removeFirstFrameOverlay(controller)));
      });
    }

    async function returnToPreviousFirstFrame(sourceSceneId) {
      const sourceId = Number(sourceSceneId);
      if (sourceId < 3 || sourceId > 5 || !isDomainActive(sourceId)) return;
      const targetId = sourceId - 1;
      const sourceController = controllerFor(sourceId);
      const targetController = controllerFor(targetId);
      if (sourceId <= 4 && sourceController?.phase !== 'hold-start') return;
      stopPlaybackLoop();
      clearPauseTimer();
      stopTransition();
      pauseAllVideos();
      clearAllReady();
      if (sourceController) sourceController.phase = 'returning';
      if (targetController) targetController.phase = 'returning';
      setStackLocked(true);
      jumpScrollTo(stackStartY());
      armInputGuard(Math.max(RETURN_TO_START_FADE_MS, transitionCrossfadeMs(targetId)) + GESTURE_IDLE_MS + 180);

      if (targetController) await seekFirstFrame(targetController);
      const start = snapshotVisuals();
      const target = firstFrameVisualTarget(targetId);
      const duration = sourceId === 5 ? RETURN_TO_START_FADE_MS : transitionCrossfadeMs(targetId);

      animateVisual(duration, eased => {
        interpolateVisuals(start, target, eased);
        applyVisuals(2, 3, 4, 5);
      }, () => {
        if (sourceController) {
          sourceController.phase = 'hold-start';
          sourceController.captionStartedAt = 0;
          sourceController.captionElapsedMs = 0;
          try { sourceController.video.pause(); } catch (_) {}
        }
        if (targetController) {
          targetController.phase = 'hold-start';
          targetController.captionStartedAt = 0;
          targetController.captionElapsedMs = 0;
          targetController.pausePending = false;
        }
        assignVisualTarget(target);
        setActiveDomain(targetId, { reason: `chapter-back-${sourceId}-to-${targetId}` });
        applyVisuals(2, 3, 4, 5);
        // One upward swipe can only complete this one chapter return.
        armInputGuard(GESTURE_IDLE_MS + 180);
      });
    }

    function normalizedWheelAmount(event) {
      const raw = Math.abs(Number(event?.deltaY) || 0);
      if (!raw) return 0;
      if (event?.deltaMode === 1) return raw * 16;
      if (event?.deltaMode === 2) return raw * Math.max(1, window.innerHeight);
      return raw;
    }

    function handleDownWheel(event, sceneId) {
      if (!VIDEO_SCENES.includes(sceneId)) return false;
      if (!isDomainActive(sceneId)) return rejectInactiveDomainInput(event);
      if (event.cancelable) event.preventDefault();
      setStackLocked(true);
      if (Math.abs(window.scrollY - stackStartY()) > 1) jumpScrollTo(stackStartY());

      if (sceneId === 2 && story.scene2EntryGuard) {
        extendScene2EntryGuard();
        return true;
      }
      const controller = controllerFor(sceneId);
      if (!controller) return true;

      // v41: Downward input never skips a video chapter. At frame 1 or while
      // paused it starts/resumes playback. While already playing it is ignored.
      if (controller.phase === 'hold-start' || controller.phase === 'paused') startVideo(sceneId);
      return true;
    }

    function handleUpWheel(event, sceneId) {
      if (story.releaseUpToScene1) {
        setStackLocked(false);
        extendScene1Release();
        return false;
      }

      if (!isDomainActive(sceneId)) return rejectInactiveDomainInput(event);
      if (sceneId === 5 && !story.stackLocked) return false;

      if (sceneId === 2) {
        const controller = controllerFor(2);
        if (controller?.phase === 'hold-start') {
          // Scene 2 at frame 1 is the only cinematic state that releases native
          // upward scrolling directly back into Scene 1.
          setActiveDomain(1, { reason: 'scene2-up-release-to-scene1' });
          setStackLocked(false);
          armScene1Release();
          return false;
        }
      }

      if (sceneId < 2 || sceneId > 5) return false;
      if (event.cancelable) event.preventDefault();

      if (sceneId === 5) {
        returnToPreviousFirstFrame(5);
        return true;
      }

      const controller = controllerFor(sceneId);
      if (!controller) return true;
      if (controller.phase === 'playing') {
        requestInertiaPause(sceneId);
        return true;
      }
      if (controller.phase === 'paused') {
        returnCurrentToFirstFrame(sceneId);
        return true;
      }
      if (controller.phase === 'hold-start' && sceneId >= 3) {
        returnToPreviousFirstFrame(sceneId);
        return true;
      }
      return true;
    }

    function onWheel(event) {
      if (!story.active || !event || !Number.isFinite(event.deltaY) || Math.abs(event.deltaY) < 0.01) return;

      if (story.inputGuard) {
        if (event.cancelable) event.preventDefault();
        extendInputGuard();
        return;
      }

      // v43 Scene 1→2 entry guard: swallow only the momentum tail of the DOWN
      // gesture that entered Scene 2. A genuine later UP gesture must still be
      // allowed to return to Scene 1. Safari may emit a tiny immediate reverse
      // correction, so UP is accepted only after a short quiet gap.
      if (story.scene2EntryGuard && story.activeDomainId === 2) {
        const now = performance.now();
        if (event.deltaY > 0) {
          if (event.cancelable) event.preventDefault();
          extendScene2EntryGuard();
          return;
        }
        const gap = now - Math.max(story.scene2EntryLastDownAt || 0, story.scene2EntryArmedAt || 0);
        if (event.deltaY < 0 && gap >= ENTRY_REVERSE_GAP_MS) {
          clearScene2EntryGuard();
          // Continue below: this is a NEW upward gesture, not entry inertia.
        } else {
          if (event.cancelable) event.preventDefault();
          return;
        }
      }

      if (story.transitionRaf) {
        if (event.cancelable) event.preventDefault();
        armInputGuard(GESTURE_IDLE_MS + 180);
        return;
      }

      // v44: wheel routing is domain-authoritative. Scroll position may move
      // during ordinary Scene 1/6 travel, but it may never select a different
      // cinematic handler behind the active scene.
      const sceneId = story.activeDomainId;

      if (event.deltaY < 0) {
        if (sceneId === 1) clearScene1EntrySnap();
        handleUpWheel(event, sceneId);
        return;
      }

      // Clamp Scene 1→2 BEFORE native scrolling can overshoot. Remaining inertia
      // from that same wheel/trackpad gesture is swallowed by the entry guard.
      if (sceneId === 1) {
        const start2 = stackStartY();
        const predictedY = window.scrollY + normalizedWheelAmount(event);
        if (predictedY >= start2 - 2) {
          clearScene1EntrySnap();
          if (event.cancelable) event.preventDefault();
          jumpToSceneFirstFrame(2, { guardScene2: true });
          return;
        }
        // If this event moves Scene 2 into the viewport but does not cross the
        // exact stack boundary, arm an idle snap. This prevents the browser from
        // being left parked at a split Scene 1 / Scene 2 frame after a short
        // wheel/trackpad gesture.
        const predictedShellTop = start2 - predictedY;
        if (predictedShellTop < window.innerHeight - 1) armScene1EntrySnap();
      }

      if (sceneId >= 2 && sceneId <= 4) {
        handleDownWheel(event, sceneId);
        return;
      }

      if (sceneId === 5) {
        // v45: do NOT hand Scene 6 the domain while the document is still at
        // the Scene 5 boundary. That caused Scene 5/6 to immediately fight over
        // ownership and made Scene 1 flash. Scene 5 keeps interaction ownership
        // while the shared stack physically leaves; Scene 6 owns interaction
        // only after its viewport boundary is actually reached.
        if (!story.stackExitForward) {
          if (event.cancelable) event.preventDefault();
          const start5 = stackStartY();
          const amount = Math.max(24, Math.min(window.innerHeight * 0.45, normalizedWheelAmount(event) || 24));
          setStackExitForward(true);
          setStackLocked(false);
          requestAnimationFrame(() => {
            if (!story.stackExitForward || story.activeDomainId !== 5) return;
            jumpScrollTo(start5 + amount);
          });
        }
        // Subsequent DOWN events are left native while Scene 5 owns the exit.
        return;
      }
    }

    function onRuntimeScroll() {
      // v46: normal browsing is navigation-driven. Runtime scroll is used only
      // as a deterministic animation timeline (not as user input), so it must
      // never change domain ownership by itself.
      if (story.navigationDriven) return;
      if (!story.active || story.programmaticScroll) return;
      const y = window.scrollY;
      const previousY = Number.isFinite(story.lastRuntimeScrollY) ? story.lastRuntimeScrollY : y;
      const direction = y > previousY + 0.5 ? 1 : (y < previousY - 0.5 ? -1 : 0);
      story.lastRuntimeScrollY = y;
      const start = stackStartY();
      const scene6Root = rootFor(6);
      const scene6Start = scene6Root
        ? Math.max(0, window.scrollY + scene6Root.getBoundingClientRect().top)
        : start + window.innerHeight;

      if (story.releaseUpToScene1) {
        setStackExitForward(false);
        setStackLocked(false);
        if (y < start - 2) {
          setActiveDomain(1, { reason: 'runtime-scroll-scene1' });
        }
        return;
      }

      if (story.activeDomainId === 1) {
        setStackExitForward(false);
        if (y >= start - 2 && y < scene6Start - 2) {
          clearScene1EntrySnap();
          jumpToSceneFirstFrame(2, { guardScene2: true });
          return;
        }
        const shell = stackShellRoot();
        const rect = shell?.getBoundingClientRect();
        if (rect && rect.top < window.innerHeight - 1 && rect.top > 1) armScene1EntrySnap();
        else clearScene1EntrySnap();
      }

      if (story.activeDomainId >= 2 && story.activeDomainId <= 4) {
        setStackLocked(true);
        if (Math.abs(y - start) > 1) jumpScrollTo(start);
        return;
      }

      if (story.activeDomainId === 5) {
        if (story.stackExitForward) {
          // Scene 5 owns the entire physical exit. A zero-distance scroll event
          // caused by removing overflow must NOT snap it back to the boundary.
          if (y >= scene6Start - 2) {
            setStackExitForward(false);
            setStackLocked(false);
            setActiveDomain(6, { reason: 'runtime-scroll-scene6-after-stack-exit' });
            return;
          }
          // If the user genuinely reverses direction and returns all the way to
          // the Scene 5 boundary, cancel the exit and re-lock Scene 5.
          if (direction < 0 && y <= start + 2) {
            setStackExitForward(false);
            jumpScrollTo(start);
            setStackLocked(true);
            setActiveDomain(5, { reason: 'runtime-scroll-cancel-stack-exit' });
          }
          return;
        }

        if (story.stackLocked) {
          if (Math.abs(y - start) > 1) jumpScrollTo(start);
          return;
        }
        // An unlocked Scene 5 outside an explicit forward exit is only allowed
        // to re-lock when it is actually returning upward to the boundary.
        if (direction < 0 && y <= start + 2) {
          jumpScrollTo(start);
          setStackLocked(true);
          setActiveDomain(5, { reason: 'runtime-scroll-back-to-scene5' });
        }
        return;
      }

      if (story.activeDomainId === 6) {
        // Scene 6 remains authoritative until a genuine upward movement reaches
        // the fully aligned Scene 5 boundary. Mere layout/overflow scroll events
        // at the same Y cannot steal the domain back.
        if (direction < 0 && y <= start + 2) {
          jumpScrollTo(start);
          setStackLocked(true);
          setActiveDomain(5, { reason: 'runtime-scroll-enter-scene5' });
        }
        return;
      }

      if (y < start - 2) {
        setStackExitForward(false);
        setStackLocked(false);
        setActiveDomain(1, { reason: 'runtime-scroll-before-stack' });
      }
    }

    /** @param {number} sceneId @param {HTMLElement} root @param {HTMLVideoElement} video @returns {VideoController} */
    function registerController(sceneId, root, video) {
      /** @type {import('../src/types').SceneId} */
      const id = /** @type {import('../src/types').SceneId} */ (Number(sceneId));
      /** @type {VideoController} */
      const controller = {
        id,
        root,
        video,
        phase: 'hold-start',
        ready: false,
        pausePending: false,
        captionStartedAt: 0,
        captionElapsedMs: 0,
        finalFrameCanvas: null,
        mountedFinalFrame: null,
        finalFrameMediaTime: NaN,
        firstFrameOverlay: null,
        frameCallbackId: 0,
        onScroll() {},
        resetForNextEntry() { jumpToSceneFirstFrame(id); }
      };
      story.controllers.set(id, controller);
      root.dataset.cinematicReady = '0';
      try { video.pause(); } catch (_) {}
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      try { video.currentTime = 0; } catch (_) {}
      video.addEventListener('ended', () => {
        if (controller.phase === 'playing') completeNatural(id);
      });
      return controller;
    }


    // Mac trackpads often emit a short run of very small pixel deltas before
    // their momentum becomes noticeable. Keep the one-gesture latch, but do
    // not wait for a mouse-sized delta total before accepting the gesture.
    const DISCRETE_WHEEL_THRESHOLD = 3;
    const DISCRETE_WHEEL_TAIL_MS = 120;
    // Strict gesture latch: one physical trackpad swipe may emit dozens of
    // wheel events. After the first threshold-crossing event changes scene,
    // the rest of that wheel stream is ignored until a quiet tail confirms
    // the gesture has actually ended. This prevents Home -> Skills jumps and
    // guarantees scripted or continuous wheel spam can never skip past one
    // adjacent scene per completed gesture.
    const DISCRETE_TOUCH_THRESHOLD = 46;

    function clearWheelGestureState() {
      if (story.wheelGestureTailTimer) clearTimeout(story.wheelGestureTailTimer);
      story.wheelGestureTailTimer = 0;
      story.wheelGestureLocked = false;
      story.wheelGestureAccum = 0;
      story.lastWheelEventAt = 0;
    }

    function resetWheelGestureAfterTail() {
      if (story.wheelGestureTailTimer) clearTimeout(story.wheelGestureTailTimer);
      story.wheelGestureTailTimer = setTimeout(() => {
        story.wheelGestureTailTimer = 0;
        story.wheelGestureLocked = false;
        story.wheelGestureAccum = 0;
        story.lastWheelEventAt = 0;
      }, DISCRETE_WHEEL_TAIL_MS);
    }

    function focusNavigationSurface() {
      if (!story.active || !story.navigationDriven) return;
      const active = document.activeElement;
      if (active?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const surface = document.getElementById('story') || document.body;
      if (!surface) return;
      if (!surface.hasAttribute('tabindex')) surface.setAttribute('tabindex', '-1');
      try { surface.focus({ preventScroll: true }); } catch (_) { try { surface.focus(); } catch (_) {} }
    }

    function restoreNavigationInput({ clearWheel = false } = {}) {
      if (clearWheel) clearWheelGestureState();
      story.touchGestureTriggered = false;
      // Keep the navigation surface armed immediately after a transition. A
      // trackpad gesture can arrive before two animation frames have elapsed;
      // delaying focus here makes the next gesture feel like it was dropped.
      focusNavigationSurface();
      requestAnimationFrame(focusNavigationSurface);
    }

    function requestAdjacentScene(direction, reason = 'discrete-scroll') {
      const step = direction > 0 ? 1 : -1;
      const base = validDomainId(story.navigationTargetId || story.activeDomainId || story.currentSceneId || 1);
      // Hard scene bounds: wheel/trackpad/keyboard navigation is clamped to the
      // seven defined pages. Contact no longer loops back to Home.
      const target = Math.max(1, Math.min(7, base + step));
      if (target === base) return base;

      // Track the requested destination immediately, not only the fully settled
      // active domain. This lets a later explicit input cancel the in-flight
      // transition without ever skipping outside the 1–7 boundary.
      story.navigationTargetId = target;
      navigateToScene(target, { autoplay: target >= 2 && target <= 4, reason });
      return target;
    }

    function handleDiscreteWheel(event) {
      if (!story.active || !story.navigationDriven) return;
      // Preserve browser zoom gestures. Everything else is swallowed so wheel
      // momentum can never become native document movement.
      if (event?.ctrlKey || event?.metaKey) return;
      if (event?.cancelable) event.preventDefault();

      const dx = Number(event?.deltaX) || 0;
      const rawDy = Number(event?.deltaY) || 0;
      let dy = Math.sign(rawDy) * normalizedWheelAmount(event);
      if (!Number.isFinite(dy)) dy = rawDy;
      const absDy = Math.abs(dy);

      // Ignore primarily-horizontal gestures, but keep suppressing native page motion.
      if (absDy < Math.abs(dx) * 1.1) {
        resetWheelGestureAfterTail();
        return;
      }

      // One completed wheel gesture may trigger only one adjacent navigation.
      // Every additional momentum event is swallowed until the wheel stream has
      // been quiet for the tail window.
      if (story.wheelGestureLocked) {
        resetWheelGestureAfterTail();
        return;
      }

      story.lastWheelEventAt = performance.now();
      story.wheelGestureAccum += dy;
      resetWheelGestureAfterTail();
      if (Math.abs(story.wheelGestureAccum) < DISCRETE_WHEEL_THRESHOLD) return;

      const direction = story.wheelGestureAccum > 0 ? 1 : -1;
      story.wheelGestureAccum = 0;
      story.wheelGestureLocked = true;
      // Trackpad wheel events do not reliably leave focus on the story after a
      // browser compositor transition. Arm it at the same moment the gesture
      // is accepted, rather than waiting for navigation to finish.
      focusNavigationSurface();
      requestAdjacentScene(direction, 'wheel-navigation');
    }

    function handleTouchStart(event) {
      if (!story.active || !story.navigationDriven) return;
      const touch = event?.touches?.[0];
      if (!touch) return;
      story.touchStartX = Number(touch.clientX) || 0;
      story.touchStartY = Number(touch.clientY) || 0;
      story.touchGestureTriggered = false;
    }

    function handleTouchMove(event) {
      if (!story.active || !story.navigationDriven) return;
      if (event?.cancelable) event.preventDefault();
      if (story.touchGestureTriggered) return;
      const touch = event?.touches?.[0];
      if (!touch) return;
      const dx = (Number(touch.clientX) || 0) - story.touchStartX;
      const dy = (Number(touch.clientY) || 0) - story.touchStartY;
      if (Math.abs(dy) < DISCRETE_TOUCH_THRESHOLD || Math.abs(dy) < Math.abs(dx) * 1.1) return;
      story.touchGestureTriggered = true;
      // Finger moves up -> content advances to the next scene.
      focusNavigationSurface();
      requestAdjacentScene(dy < 0 ? 1 : -1, 'touch-navigation');
    }

    function handleTouchEnd() {
      story.touchGestureTriggered = false;
    }

    function blockMiddleMouse(event) {
      if (!story.active || !story.navigationDriven) return;
      if (Number(event?.button) !== 1) return;
      event.preventDefault();
    }

    function blockNavigationKey(event) {
      if (!story.active || !story.navigationDriven) return;
      const target = event?.target;
      const editable = target?.closest?.('input, textarea, select, [contenteditable="true"]');
      if (editable) return;

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        // One physical key press = one adjacent scene. Ignore OS key-repeat so
        // holding the key cannot race through all seven scenes.
        if (event.repeat) return;
        clearWheelGestureState();
        requestAdjacentScene(event.key === 'ArrowDown' ? 1 : -1, 'keyboard-navigation');
        return;
      }

      // Keep the browser from falling back to native page scrolling for keys
      // that are not part of this portfolio's navigation model.
      if (new Set(['PageUp','PageDown','Home','End',' ']).has(event.key)) event.preventDefault();
    }

    function animateWindowScrollTo(targetY, duration = 620) {
      const from = Math.max(0, Number(window.scrollY) || 0);
      const to = Math.max(0, Number(targetY) || 0);
      const delta = to - from;
      if (Math.abs(delta) < 0.5 || duration <= 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        story.programmaticScroll = true;
        window.scrollTo(0, to);
        story.programmaticScroll = false;
        return Promise.resolve();
      }
      const token = story.navigationToken;
      story.programmaticScroll = true;
      return new Promise(resolve => {
        const began = performance.now();
        const frame = now => {
          if (token !== story.navigationToken) {
            story.programmaticScroll = false;
            resolve();
            return;
          }
          const raw = Math.min(1, (now - began) / Math.max(1, duration));
          const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
          window.scrollTo(0, from + delta * eased);
          if (raw < 1) requestAnimationFrame(frame);
          else {
            window.scrollTo(0, to);
            story.programmaticScroll = false;
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });
    }

    function cancelForNavigation({ preserveFrozenSceneId = null } = {}) {
      story.navigationToken += 1;
      story.navigationBusy = true;
      stopPlaybackLoop();
      stopTransition();
      clearPauseTimer();
      clearScene1EntrySnap();
      clearScene2EntryGuard();
      story.releaseUpToScene1 = false;
      story.stackExitForward = false;
      story.inputGuard = false;
      if (story.inputGuardTimer) clearTimeout(story.inputGuardTimer);
      story.inputGuardTimer = 0;
      pauseAllVideos();
      clearAllReady();
      for (const [controllerId, controller] of story.controllers.entries()) {
        controller.pausePending = false;
        removeFirstFrameOverlay(controller);
        if (Number(controllerId) !== Number(preserveFrozenSceneId)) clearFrozenFinalFrame(controller);
      }
    }

    function visualCrossfadeToFirstFrame(targetId, duration = 300, { carryPreviousCaption = false } = {}) {
      const id = Number(targetId);
      const targetController = controllerFor(id);
      const outgoingId = Number(story.activeDomainId);
      const outgoingController = controllerFor(outgoingId);
      const outgoingFrozen = outgoingController?.mountedFinalFrame || null;
      const frozenStartOpacity = outgoingFrozen
        ? clamp01(Number.parseFloat(outgoingFrozen.style.opacity || '1'))
        : 0;
      const token = story.navigationToken;
      return new Promise(async resolve => {
        if (targetController) {
          try { targetController.video.pause(); } catch (_) {}
          await seekFirstFrame(targetController);
          targetController.phase = 'hold-start';
          targetController.captionStartedAt = 0;
          targetController.captionElapsedMs = 0;
          targetController.pausePending = false;
          setReady(id, false);
        }
        if (token !== story.navigationToken) { resolve(false); return; }
        const start = snapshotVisuals();
        const target = navigationFirstFrameTarget(id, carryPreviousCaption);
        const d = Math.max(0, Number(duration) || 0);
        if (d <= 0) {
          assignVisualTarget(target);
          if (outgoingFrozen) clearFrozenFinalFrame(outgoingController);
          applyVisuals(2,3,4,5);
          resolve(true);
          return;
        }
        animateVisual(d, eased => {
          if (token !== story.navigationToken) return;
          interpolateVisuals(start, target, eased);
          if (outgoingFrozen) outgoingFrozen.style.opacity = String(frozenStartOpacity * (1 - eased));
          applyVisuals(2,3,4,5);
        }, () => {
          if (token !== story.navigationToken) { resolve(false); return; }
          assignVisualTarget(target);
          if (outgoingFrozen) clearFrozenFinalFrame(outgoingController);
          applyVisuals(2,3,4,5);
          resolve(true);
        });
      });
    }

    async function navigateToScene(sceneId, { autoplay = true, reason = 'navigation' } = {}) {
      const id = validDomainId(sceneId);
      story.navigationTargetId = id;
      const current = story.activeDomainId;
      const fromDiscretePointerGesture = reason === 'wheel-navigation' || reason === 'touch-navigation';
      if (!fromDiscretePointerGesture) clearWheelGestureState();

      // Clicking the current video chapter while it is sitting at frame 1 means
      // "play this chapter". While already playing, do not restart it.
      const sameController = controllerFor(id);
      if (id >= 2 && id <= 4 && current === id) {
        if ((sameController?.phase === 'hold-start' || sameController?.phase === 'paused') && autoplay) startVideo(id);
        story.navigationBusy = false;
        restoreNavigationInput({ clearWheel: !fromDiscretePointerGesture });
        return id;
      }
      if (current === id && (id === 1 || id >= 5)) {
        story.navigationBusy = false;
        restoreNavigationInput({ clearWheel: !fromDiscretePointerGesture });
        return id;
      }

      const preserveFrozenSceneId = (
        id >= 2 && id <= 5 &&
        current >= 2 && current <= 4 &&
        controllerFor(current)?.mountedFinalFrame
      ) ? current : null;
      cancelForNavigation({ preserveFrozenSceneId });
      const navToken = story.navigationToken;

      if (id === 1) {
        const returningFromCinematic = story.stackLocked || (current >= 2 && current <= 5);
        setStackLocked(false);
        setStackExitForward(false);
        setActiveDomain(1, { reason });

        // v47 — Home recovery must be transactional when leaving the fixed
        // cinematic stack. Safari can keep the root scroller in the previous
        // overflow:hidden layout for the rest of the current frame, so starting
        // scroll animation immediately after setStackLocked(false) can leave
        // Scene 1 at a non-zero transition progress. Blog/Contact never hit this
        // path because the stack is already unlocked, which is why 6/7 -> Home
        // recovered correctly while 2–5 -> Home could remain partially shifted.
        if (returningFromCinematic) {
          // Remove any temporary compositor-only entry/exit state as part of
          // the same reset, then give the browser two paints to restore the
          // normal document scroller before changing scrollY.
          const stack = stackRoot();
          stack?.classList.remove('is-entry-committing', 'is-exiting-forward');
          document.body.classList.remove('cinematic-entry-committing', 'cinematic-stack-exiting');
          void document.documentElement.offsetHeight;
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (navToken !== story.navigationToken) return story.activeDomainId;
        }

        await animateWindowScrollTo(0, 680);
        if (navToken !== story.navigationToken) return story.activeDomainId;

        // Hard-finish at the canonical Home position and synchronously rebuild
        // Scene 1's scroll-driven transforms/opacities. This avoids depending on
        // a deferred browser scroll event to restore the final few pixels/state.
        jumpScrollTo(0);
        window.JoeSceneRuntime?.syncRuntimeScrollState?.();
        story.lastRuntimeScrollY = 0;
        story.navigationBusy = false;
        restoreNavigationInput({ clearWheel: !fromDiscretePointerGesture });
        return 1;
      }

      if (id >= 2 && id <= 5) {
        const targetController = controllerFor(id);
        if (targetController) {
          await seekFirstFrame(targetController);
          targetController.phase = 'hold-start';
          targetController.captionStartedAt = 0;
          targetController.captionElapsedMs = 0;
        }
        clearAllReady();
        const target = navigationFirstFrameTarget(id, current === id - 1);

        // From Home or Blog/Contact, retain the original vertical page travel.
        // Scene 1's existing scroll-based foreground/background transition is
        // therefore still used, but the browser—not the user—drives it.
        if (current === 1 || current >= 6) {
          assignVisualTarget(target);
          applyVisuals(2,3,4,5);
          setStackLocked(false);
          setActiveDomain(current, { reason: `${reason}-travel` });
          await animateWindowScrollTo(stackStartY(), current === 1 ? 760 : 620);
          if (navToken !== story.navigationToken) return story.activeDomainId;
          jumpScrollTo(stackStartY());
          setStackLocked(true);
          setActiveDomain(id, { reason });
        } else {
          setStackLocked(true);
          jumpScrollTo(stackStartY());
          const sourceId = current;
          const duration = sourceId >= 2 && sourceId <= 4
            ? transitionCrossfadeMs(sourceId)
            : (id >= 2 && id <= 4 ? transitionCrossfadeMs(id) : DEFAULT_VIDEO_CROSSFADE_MS);
          // Direct scene selection must begin from a clean first frame. Carrying
          // the previous caption is reserved for the deliberate sequential
          // cinematic transition, never for a manual/top-navigation jump.
          const ok = await visualCrossfadeToFirstFrame(id, duration, {
            carryPreviousCaption: sourceId === id - 1 && reason === 'wheel-navigation'
          });
          if (!ok || navToken !== story.navigationToken) return story.activeDomainId;
          setActiveDomain(id, { reason });
        }

        if (id >= 2 && id <= 4 && autoplay && navToken === story.navigationToken) startVideo(id);
        story.navigationBusy = false;
        // Keep wheel/touch inertia locked until its own tail expires, but reclaim
        // the page focus immediately so a fresh trackpad gesture or arrow key
        // never requires an extra click (notably when landing on Scene 5).
        restoreNavigationInput({ clearWheel: !fromDiscretePointerGesture });
        return id;
      }

      // Blog / Contact are ordinary black full-screen pages. The active
      // cinematic frame leaves vertically under deterministic program control.
      // Hide Scene 5 before unlocking the stack so the browser never paints a
      // one-frame flash of the cinematic scene during the scroll to Scene 6/7.
      if (current === 5) {
        story.visuals.scene5ContentOpacity = 0;
        applyVisuals(5);
      }
      setStackLocked(false);
      setStackExitForward(false);
      const targetY = sceneStartY(id);
      await animateWindowScrollTo(targetY, 620);
      if (navToken !== story.navigationToken) return story.activeDomainId;
      setActiveDomain(id, { reason });
      story.navigationBusy = false;
      restoreNavigationInput({ clearWheel: !fromDiscretePointerGesture });
      return id;
    }

    function installGlobalHandlers() {
      if (story.installed || !story.active) return;
      story.installed = true;
      document.documentElement.classList.add('portfolio-navigation-driven');
      document.body.classList.add('portfolio-navigation-driven');
      const navigationSurface = document.getElementById('story') || document.body;
      if (navigationSurface && !navigationSurface.hasAttribute('tabindex')) navigationSurface.setAttribute('tabindex', '-1');
      window.addEventListener('wheel', handleDiscreteWheel, { passive: false, capture: true });
      window.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      window.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
      window.addEventListener('touchcancel', handleTouchEnd, { passive: true, capture: true });
      window.addEventListener('keydown', blockNavigationKey, { capture: true });
      window.addEventListener('mousedown', blockMiddleMouse, { capture: true });
      window.addEventListener('blur', () => {
        clearPauseTimer();
        story.inputGuard = false;
        if (story.inputGuardTimer) clearTimeout(story.inputGuardTimer);
        story.inputGuardTimer = 0;
        clearWheelGestureState();
        story.touchGestureTriggered = false;
      });
      window.addEventListener('focus', () => restoreNavigationInput({ clearWheel: true }));
      window.addEventListener('pageshow', () => restoreNavigationInput({ clearWheel: true }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setStackExitForward(false);
        setStackLocked(false);
        setVideoFirstFrame(2);
        setVideoFirstFrame(3);
        setVideoFirstFrame(4);
        assignVisualTarget(firstFrameVisualTarget(2));
        story.navigationTargetId = 1;
        setActiveDomain(1, { reason: 'initial-home' });
        window.scrollTo(0, 0);
        applyVisuals(2,3,4,5);
        restoreNavigationInput({ clearWheel: true });
      }));
    }

    story.registerController = registerController;
    story.installGlobalHandlers = installGlobalHandlers;
    story.onRuntimeScroll = onRuntimeScroll;
    story.jumpToSceneFirstFrame = jumpToSceneFirstFrame;
    story.startVideo = startVideo;
    story.completeNatural = completeNatural;
    story.presetFirstFrame = presetFirstFrame;
    story.sceneStartY = sceneStartY;
    story.stackStartY = stackStartY;
    story.setStackLocked = setStackLocked;
    story.syncStackSceneClasses = syncStackSceneClasses;
    story.getPauseInertiaMs = pauseInertiaMs;
    story.isReady = sceneId => Boolean(controllerFor(sceneId)?.ready);
    story.getActiveDomainId = () => story.activeDomainId;
    story.isDomainActive = isDomainActive;
    story.setActiveDomain = setActiveDomain;
    story.syncDomainClasses = syncDomainClasses;
    story.navigateToScene = navigateToScene;
    story.isNavigationDriven = () => Boolean(story.navigationDriven);
    story.getDomainSnapshot = () => ({
      activeDomainId: story.activeDomainId,
      activeDomain: `scene-${story.activeDomainId}`,
      currentSceneId: story.currentSceneId,
      stackLocked: story.stackLocked,
      stackExitForward: story.stackExitForward,
      navigationDriven: story.navigationDriven,
      navigationBusy: story.navigationBusy,
      controllers: Object.fromEntries([...story.controllers.entries()].map(([id, controller]) => [id, {
        phase: controller.phase,
        ready: Boolean(controller.ready),
        paused: Boolean(controller.video?.paused)
      }]))
    });
    return story;
  }

  /** @param {{ editMode?: boolean, sceneId?: number, rootId?: string, videoId?: string }} options */
  window.createJoeSimpleVideoController = function createJoeSimpleVideoController({
    editMode = false,
    sceneId,
    rootId,
    videoId
  } = {}) {
    /** @type {HTMLElement|null} */
    const root = document.getElementById(rootId || '');
    /** @type {HTMLVideoElement|null} */
    const video = /** @type {HTMLVideoElement|null} */ (document.getElementById(videoId || ''));
    if (!root || !video) return {};

    if (editMode) {
      video.pause();
      try { video.currentTime = 0; } catch (_) {}
      return { onScroll() {}, resetForNextEntry() {} };
    }

    let story = window.__joeSimpleVideoStory;
    if (!story || !story.active) {
      story = createStoryEngine(false);
      window.__joeSimpleVideoStory = story;
    }
    const controller = story.registerController?.(sceneId || 1, root, video);
    story.installGlobalHandlers?.();
    return controller;
  };
})();
