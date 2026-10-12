// Opt-in only: measure actual Unity browser callbacks and GPU work without changing quality.
(() => {
  if (new URLSearchParams(location.search).get('perf') !== '1') return;
  const canvas = document.getElementById('game');
  const nativeContext = canvas.getContext;
  const nativeRAF = window.requestAnimationFrame.bind(window);
  let gl, timer, query, draws = 0, cpu = [], gpu = [], drawSamples = [], pending = [];
  const textures = new WeakMap(), bindings = new Map(), targets = new Set();
  canvas.getContext = function (...args) {
    const result = nativeContext.apply(this, args);
    if (!gl && result && /^webgl/.test(args[0])) {
      gl = result; timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        const original = gl[name].bind(gl);
        gl[name] = function (...parameters) { draws++; return original(...parameters); };
      }
      const bind = gl.bindTexture.bind(gl), image = gl.texImage2D.bind(gl), storage = gl.texStorage2D.bind(gl);
      gl.bindTexture = function (target, texture) { bindings.set(target, texture); return bind(target, texture); };
      gl.texImage2D = function (...p) { if (p.length >= 9 && p[1] === 0 && bindings.get(p[0])) textures.set(bindings.get(p[0]), [p[3], p[4]]); return image(...p); };
      gl.texStorage2D = function (...p) { if (bindings.get(p[0])) textures.set(bindings.get(p[0]), [p[3], p[4]]); return storage(...p); };
      const attach = gl.framebufferTexture2D.bind(gl);
      gl.framebufferTexture2D = function (...p) { const size = textures.get(p[3]); if (size) targets.add(size.join('x')); return attach(...p); };
    }
    return result;
  };
  window.requestAnimationFrame = callback => nativeRAF(time => {
    const before = performance.now(), firstDraw = draws;
    if (gl && timer && !query) { query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }
    callback(time);
    if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({query, rendered:draws > firstDraw}); query = null; }
    if (draws > firstDraw) { cpu.push(performance.now() - before); drawSamples.push(draws - firstDraw); }
  });
  const panel = document.createElement('pre'); panel.id = 'runner-frame-audit';
  Object.assign(panel.style, { position:'fixed', left:'8px', top:'8px', zIndex:30, color:'#fff', background:'#101820e8', padding:'8px', font:'12px monospace', pointerEvents:'none' });
  document.body.appendChild(panel);
  const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  setInterval(() => {
    if (gl && timer) {
      while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
        const value = pending.shift(); if (value.rendered && !gl.getParameter(timer.GPU_DISJOINT_EXT)) gpu.push(gl.getQueryParameter(value.query, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(value.query);
      }
      // Keep query count bounded if a background tab stops completing GPU work.
      while (pending.length > 180) gl.deleteQuery(pending.shift().query);
    }
    const r = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1;
    const module = window.runnerPlayer?.Module;
    // Release Emscripten exports HEAPU32/HEAPF32, but may keep HEAPU8 private.
    const heap = module?.HEAPU32 || module?.HEAPF32;
    const report = { cpuMs:mean(cpu), gpuMs:mean(gpu), draws:mean(drawSamples), canvas:[canvas.width,canvas.height], native:[Math.round(r.width*ratio),Math.round(r.height*ratio)], targets:[...targets], threadsAvailable:crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined', sharedHeap:heap ? typeof SharedArrayBuffer !== 'undefined' && heap.buffer instanceof SharedArrayBuffer : null, heapMB:heap ? heap.byteLength/1048576 : null };
    panel.textContent = `Unity callback CPU: ${report.cpuMs?.toFixed(2) ?? 'pending'} ms\nGPU: ${report.gpuMs?.toFixed(2) ?? 'timer unavailable'} ms\nDraws: ${report.draws?.toFixed(0) ?? 'pending'}\nRender targets: ${report.targets.join(', ')}\nRuntime: ${window.runnerRuntimeMode || 'single'}; shared heap: ${report.sharedHeap}\nWasm heap: ${report.heapMB ?? 'unavailable'} MB\nNative workers available: ${report.threadsAvailable}`;
    panel.dataset.report = JSON.stringify(report); cpu=[];gpu=[];drawSamples=[];
  }, 2000);
})();
