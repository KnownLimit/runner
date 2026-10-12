// Optional local diagnostics: append ?perf=1. No uploads or telemetry.
(() => {
  if (new URLSearchParams(location.search).get('perf') !== '1') return;
  const panel = document.createElement('pre');
  panel.id = 'runner-performance';
  Object.assign(panel.style, { position: 'fixed', right: '8px', bottom: '8px', zIndex: '20',
    margin: '0', padding: '8px', color: '#d5f4ec', background: '#10242be8',
    font: '12px monospace', pointerEvents: 'none', border: '1px solid #58b4ab' });
  document.body.appendChild(panel);
  let last = performance.now(), start = last, frames = 0, samples = [];
  const tick = now => {
    if (document.hidden) { last = start = now; frames = 0; samples.length = 0; }
    else {
      const delta = now - last;
      if (delta > 0) samples.push(delta);
      last = now; frames++;
      if (now - start >= 1500) {
        const fps = frames * 1000 / (now - start);
        samples.sort((a, b) => a - b);
        const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * .95))] || 0;
        const canvas = document.getElementById('game');
        const texture = window.runnerSelectedTexture || 'loading';
        panel.textContent = `Browser cadence: ${fps.toFixed(1)} frames/s\n95th percentile interval: ${p95.toFixed(1)} ms\nCanvas: ${canvas?.width || 0} x ${canvas?.height || 0}\nTexture payload: ${texture}\nCompare the same route in FX LOW and FX FULL.`;
        window.runnerBrowserTiming = { fps, p95Milliseconds: p95, texture, width: canvas?.width, height: canvas?.height };
        frames = 0; start = now; samples.length = 0;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
