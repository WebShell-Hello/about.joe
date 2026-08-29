(() => {
  'use strict';

  const canvas = document.getElementById('digitalRainCanvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    console.warn('[Joe] WebGL2 is unavailable; digital rain disabled.');
    canvas.hidden = true;
    return;
  }

  const vertexSource = `#version 300 es
  precision highp float;
  const vec2 POSITIONS[3] = vec2[3](
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0)
  );
  out vec2 vUv;
  void main() {
    vec2 p = POSITIONS[gl_VertexID];
    vUv = p * 0.5 + 0.5;
    gl_Position = vec4(p, 0.0, 1.0);
  }`;

  const fragmentSource = `#version 300 es
  precision highp float;

  in vec2 vUv;
  out vec4 outColor;

  uniform vec2 uResolution;
  uniform vec2 uLens;
  uniform float uRadius;
  uniform float uFeather;
  uniform float uTime;
  uniform float uVisible;
  uniform float uDensity;
  uniform float uDigitSize;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }

  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  float digitZero(vec2 p) {
    // Rounded rectangular ring: deliberately simple so thousands of glyphs
    // remain cheap while still reading clearly as binary zeroes.
    float outer = sdBox(p, vec2(0.26, 0.39));
    float inner = sdBox(p, vec2(0.12, 0.25));
    float ring = max(outer, -inner);
    return 1.0 - smoothstep(0.015, 0.065, ring);
  }

  float digitOne(vec2 p) {
    float stem = 1.0 - smoothstep(0.015, 0.065, sdBox(p - vec2(0.02, 0.0), vec2(0.055, 0.39)));
    float cap = 1.0 - smoothstep(0.015, 0.065, sdBox(p - vec2(-0.075, -0.30), vec2(0.13, 0.05)));
    float foot = 1.0 - smoothstep(0.015, 0.065, sdBox(p - vec2(0.0, 0.34), vec2(0.14, 0.045)));
    return max(stem, max(cap, foot));
  }

  void main() {
    // Convert UV to top-left-origin CSS-pixel coordinates so the shader uses
    // the same x/y/radius/feather space as the portfolio lens state.
    vec2 p = vec2(vUv.x * uResolution.x, (1.0 - vUv.y) * uResolution.y);

    float lensDistance = distance(p, uLens);
    float lens = 1.0 - smoothstep(uRadius, uRadius + max(0.5, uFeather), lensDistance);
    lens *= uVisible;
    if (lens <= 0.001) {
      outColor = vec4(0.0);
      return;
    }

    float density = clamp(uDensity, 0.5, 2.5);
    float digitSize = clamp(uDigitSize, 0.55, 1.8);
    // Density changes the number of independent rain lanes without coupling it
    // to glyph size. Higher density therefore produces more streams rather
    // than merely shrinking the digits.
    float CELL_W = 17.0 / density;
    const float CELL_H = 21.0;
    float column = floor(p.x / CELL_W);
    float columnSeed = hash11(column + 7.13);
    float speed = mix(72.0, 188.0, hash11(column + 18.7));
    float densityTrailBoost = mix(0.92, 1.42, clamp((density - 0.5) / 2.0, 0.0, 1.0));
    float trailCells = mix(10.0, 30.0, hash11(column + 31.1)) * densityTrailBoost;
    float cyclePx = uResolution.y + trailCells * CELL_H + 90.0;
    float head = mod(uTime * speed + columnSeed * cyclePx, cyclePx) - trailCells * CELL_H;

    // Repeat the falling head in a stable cycle. The rain field itself exists
    // across the whole screen; only the final lens multiplication reveals it.
    float behind = head - p.y;
    if (behind < 0.0) behind += cyclePx;
    float trailPx = trailCells * CELL_H;
    float trail = 1.0 - smoothstep(0.0, trailPx, behind);

    vec2 localPx = vec2(mod(p.x, CELL_W) - CELL_W * 0.5, mod(p.y, CELL_H) - CELL_H * 0.5);
    // Keep physical glyph size independent of lane spacing. digitSize is a
    // direct visual scale multiplier exposed in the editor.
    vec2 glyphP = vec2(localPx.x / (12.6 * digitSize), localPx.y / (13.55 * digitSize));
    float row = floor(p.y / CELL_H);
    float bit = step(0.5, hash21(vec2(column, row + floor(columnSeed * 17.0))));
    float glyph = mix(digitZero(glyphP), digitOne(glyphP), bit);

    // Density also controls the probability that a lane is active. At high
    // values almost every lane rains; at low values the field stays sparse.
    float densityNorm = clamp((density - 0.5) / 2.0, 0.0, 1.0);
    float gateStart = mix(0.52, 0.02, densityNorm);
    float columnGate = smoothstep(gateStart, min(0.98, gateStart + 0.18), hash11(column + 51.8));
    float sparkle = 0.72 + 0.28 * hash21(vec2(column * 1.7, row * 2.3));
    float headGlow = exp(-behind / max(8.0, CELL_H * 1.2));
    float alpha = glyph * trail * columnGate * sparkle;
    alpha *= mix(0.30, 1.0, headGlow);

    vec3 tailColor = vec3(0.00, 0.46, 0.72);
    vec3 headColor = vec3(0.22, 0.96, 1.00);
    vec3 color = mix(tailColor, headColor, clamp(headGlow * 1.55, 0.0, 1.0));
    float finalAlpha = alpha * lens * 0.88;
    outColor = vec4(color * finalAlpha, finalAlpha);
  }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  let program;
  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'WebGL program link failed');
    }
  } catch (error) {
    console.error('[Joe] Digital rain shader failed:', error);
    canvas.hidden = true;
    return;
  }

  gl.useProgram(program);
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'uResolution'),
    lens: gl.getUniformLocation(program, 'uLens'),
    radius: gl.getUniformLocation(program, 'uRadius'),
    feather: gl.getUniformLocation(program, 'uFeather'),
    time: gl.getUniformLocation(program, 'uTime'),
    visible: gl.getUniformLocation(program, 'uVisible'),
    density: gl.getUniformLocation(program, 'uDensity'),
    digitSize: gl.getUniformLocation(program, 'uDigitSize')
  };

  // A VAO is mandatory in WebGL2 even though the full-screen triangle uses
  // gl_VertexID and has no vertex buffers.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let rafId = 0;
  let running = false;
  let sceneActive = true;
  let activeStartedAt = 0;
  let accumulatedSeconds = 0;
  let lastCssWidth = 0;
  let lastCssHeight = 0;
  let lastDpr = 0;

  function lensState() {
    const state = window.__joeXrayLensState || {};
    return {
      active: Boolean(state.active),
      x: Number(state.viewportX) || 0,
      y: Number(state.viewportY) || 0,
      radius: Math.max(1, Number(state.radiusPx) || 1),
      feather: Math.max(0, Number(state.featherPx) || 0)
    };
  }


  function rainSettings() {
    const state = window.JoeSceneRuntime?.layout?.digitalRain || {};
    return {
      density: Math.max(0.5, Math.min(2.5, Number(state.density) || 1.60)),
      digitSize: Math.max(0.55, Math.min(1.8, Number(state.digitSize) || 1.10))
    };
  }

  function resizeIfNeeded() {
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    // Cap DPR at 2.0: the effect is glyph-heavy and gains little visual value
    // above Retina 2x, while fragment cost grows quadratically.
    const dpr = Math.max(1, Math.min(2, Number(window.devicePixelRatio) || 1));
    if (cssWidth === lastCssWidth && cssHeight === lastCssHeight && Math.abs(dpr - lastDpr) < 0.01) return;
    lastCssWidth = cssWidth;
    lastCssHeight = cssHeight;
    lastDpr = dpr;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw(now) {
    if (!running) return;
    resizeIfNeeded();
    const rect = canvas.getBoundingClientRect();
    const lens = lensState();
    const elapsed = accumulatedSeconds + Math.max(0, (now - activeStartedAt) / 1000);

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.uniform2f(uniforms.resolution, Math.max(1, rect.width), Math.max(1, rect.height));
    gl.uniform2f(uniforms.lens, lens.x - rect.left, lens.y - rect.top);
    gl.uniform1f(uniforms.radius, lens.radius);
    gl.uniform1f(uniforms.feather, lens.feather);
    const rain = rainSettings();
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.visible, lens.active ? 1 : 0);
    gl.uniform1f(uniforms.density, rain.density);
    gl.uniform1f(uniforms.digitSize, rain.digitSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    rafId = requestAnimationFrame(draw);
  }

  function start() {
    if (running || !sceneActive || document.hidden) return;
    running = true;
    canvas.dataset.running = '1';
    activeStartedAt = performance.now();
    rafId = requestAnimationFrame(draw);
  }

  function stop() {
    if (!running) return;
    accumulatedSeconds += Math.max(0, (performance.now() - activeStartedAt) / 1000);
    running = false;
    canvas.dataset.running = '0';
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    // Clear once on stop so a compositor snapshot cannot leave stale rain over
    // the next scene. The simulation clock itself is retained for resume.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function setSceneActive(active) {
    sceneActive = Boolean(active);
    if (sceneActive) start(); else stop();
  }

  window.addEventListener('joe-active-domain-change', event => {
    setSceneActive(Number(event.detail?.sceneId) === 1);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (sceneActive) start();
  });

  window.addEventListener('resize', resizeIfNeeded, { passive: true });
  window.addEventListener('pagehide', stop, { once: true });

  // Initial state is Home. If the story engine has already selected another
  // domain by the time this module starts, honour it immediately.
  const story = window.__joeSimpleVideoStory;
  if (story?.getActiveDomainId) sceneActive = Number(story.getActiveDomainId()) === 1;
  start();

  window.__joeDigitalRain = {
    start,
    stop,
    get running() { return running; },
    get accumulatedSeconds() {
      return accumulatedSeconds + (running ? Math.max(0, (performance.now() - activeStartedAt) / 1000) : 0);
    }
  };
})();
