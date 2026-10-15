// Optional render diagnostics: append ?perf=1. No network telemetry.
(() => {
  if (new URLSearchParams(location.search).get('perf') !== '1') return;
  const canvas = document.getElementById('game');
  // Count browser presentation intervals containing actual Unity GL work,
  // rather than unrelated requestAnimationFrame callbacks. Only diagnostic
  // builds/views install this low-frequency clear observer.
  let rendered = false, observed = false;
  const nativeGetContext = canvas.getContext;
  canvas.getContext = function (...args) {
    const gl = nativeGetContext.apply(this, args);
    if (gl && /^webgl/.test(args[0]) && !gl.runnerClearObserved) {
      const nativeClear = gl.clear;
      gl.clear = function (mask) { rendered = true; return nativeClear.call(this, mask); };
      gl.runnerClearObserved = true;
      observed = true;
    }
    return gl;
  };
  const panel = document.createElement('pre');
  panel.id = 'runner-performance';
  Object.assign(panel.style, { position: 'fixed', right: '8px', bottom: '8px', zIndex: '20',
    margin: '0', padding: '8px', color: '#d5f4ec', background: '#10242be8',
    font: '12px monospace', pointerEvents: 'none', border: '1px solid #58b4ab' });
  document.body.appendChild(panel);
  let start = performance.now(), lastRender = start, frames = 0, samples = [];
  const tick = now => {
    if (document.hidden) { start = lastRender = now; frames = 0; samples.length = 0; rendered = false; }
    else {
      if (rendered) {
        const delta = now - lastRender;
        if (delta > 0) samples.push(delta);
        lastRender = now;
        frames++;
        rendered = false;
      }
      if (now - start >= 1500) {
        const fps = frames * 1000 / (now - start);
        samples.sort((a, b) => a - b);
        const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * .95))] || 0;
        const rectangle = canvas.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const expected = {width: Math.round(rectangle.width * ratio), height: Math.round(rectangle.height * ratio)};
        const unity = window.runnerRenderStats;
        const world = {width: unity?.width || canvas.width, height: unity?.height || canvas.height};
        const native = Math.abs(canvas.width - expected.width) <= 1 && Math.abs(canvas.height - expected.height) <= 1 && Math.abs(world.width - expected.width) <= 1 && Math.abs(world.height - expected.height) <= 1;
        const texture = window.runnerSelectedTexture || 'loading';
        const revision = window.runnerTexturePayloads?.revision || 'unknown';
        panel.textContent = `FPS: ${unity ? unity.fps.toFixed(1) : (observed ? fps.toFixed(1) : 'waiting')} (${unity ? 'Unity rendered' : 'observed rendered'})\n${unity ? 'Mean frame: ' + unity.milliseconds.toFixed(1) : '95th percentile: ' + p95.toFixed(1)} ms\nWorld: ${world.width} x ${world.height}\nCanvas: ${canvas.width} x ${canvas.height}\nNative: ${expected.width} x ${expected.height} (${native ? 'MATCH' : 'MISMATCH'})\nTexture: ${texture}\nBuild: ${revision}\nCompare the same route in LOW and FULL.`;
        window.runnerBrowserTiming = {fps: unity?.fps ?? fps, p95Milliseconds: p95, observed, texture,
          width: canvas.width, height: canvas.height, expected, world, native, revision};
        frames = 0; start = now; samples.length = 0;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
