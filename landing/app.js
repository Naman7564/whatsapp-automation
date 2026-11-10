const $ = (selector) => document.querySelector(selector);
const form = $('#demo-form');
const surface = $('#surface');
const status = $('#render-status');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = $('#motion');
const stage = $('#stage');
let activeMode = '2d';
let generation = 0;
let dispose = () => {};
let visible = true;
motion.checked = !reducedMotion.matches;

const snippets = {
  '2d': `const ctx = canvas.getContext('2d');\n\ncanvas.onpaint = () => {\n  ctx.reset();\n  ctx.scale(devicePixelRatio, devicePixelRatio);\n  ctx.drawElementImage(form, 40, 40);\n};\ncanvas.requestPaint();`,
  webgl: `// Allocate a texture to the element's size first.\ncanvas.onpaint = () => {\n  gl.bindTexture(gl.TEXTURE_2D, texture);\n  gl.texElementSubImage2D(\n    gl.TEXTURE_2D, 0, 0, 0, form\n  );\n  renderShaderFrame();\n  canvas.updateElementGeometry(form, {\n    canvasTransform: elementToCanvas\n  });\n};`,
  webgpu: `// Create a texture with COPY_DST and\n// RENDER_ATTACHMENT usage, then sample it.\ncanvas.onpaint = () => {\n  device.queue.drawElementImageToTexture(\n    { source: form },\n    { texture, size: [width, height, 1] }\n  );\n  renderShaderFrame();\n  canvas.updateElementGeometry(form, {\n    canvasTransform: elementToCanvas\n  });\n};`
};

export function supportsHtmlInCanvas() {
  const test = document.createElement('canvas');
  test.setAttribute('content', 'drawable');
  return (test.content === 'drawable' || 'requestPaint' in HTMLCanvasElement.prototype)
    && typeof test.requestPaint === 'function';
}

function showFallback(message) {
  dispose();
  dispose = () => {};
  surface.replaceChildren(form);
  status.textContent = message;
}

function measure(canvas) {
  const dpr = canvas.width / canvas.clientWidth;
  const width = form.offsetWidth;
  const height = form.offsetHeight;
  return { dpr, width, height, x: (canvas.clientWidth - width) / 2, y: (canvas.clientHeight - height) / 2 };
}

function syncGeometry(canvas, box) {
  // GPU snapshots are projected onto an undistorted plane. Keep the exact
  // same affine mapping for focus, caret, and pointer hit-testing.
  canvas.updateElementGeometry(form, {
    canvasTransform: new DOMMatrix().scale(box.dpr).translate(box.x, box.y)
  });
}

function snapshotSize(canvas) {
  if (typeof canvas.getElementImageDefaultSize === 'function') return canvas.getElementImageDefaultSize(form);
  const image = canvas.captureElementImage(form);
  const size = { width: image.width ?? form.offsetWidth * devicePixelRatio, height: image.height ?? form.offsetHeight * devicePixelRatio };
  image.close?.();
  return size;
}

function create2D(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.drawElementImage !== 'function') throw new Error('2D HTML drawing is unavailable');
  return {
    draw() {
      const b = measure(canvas);
      ctx.reset();
      ctx.scale(b.dpr, b.dpr);
      ctx.drawElementImage(form, b.x, b.y, b.width, b.height);
    },
    destroy() {}
  };
}

function createWebGL(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
  if (!gl || typeof gl.texElementSubImage2D !== 'function' || typeof canvas.updateElementGeometry !== 'function') {
    throw new Error('WebGL HTML textures are unavailable');
  }
  const shaders = [];
  function compile(type, source) {
    const shader = gl.createShader(type);
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
    precision highp float;
    out vec2 uv;
    void main() {
      vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      uv = vec2(p.x, 1.0 - p.y);
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#version 300 es
    precision highp float;
    uniform sampler2D image;
    uniform float time;
    in vec2 uv;
    out vec4 color;
    void main() {
      vec4 sampleColor = texture(image, uv);
      float sheen = 0.97 + 0.03 * sin(uv.x * 5.0 + uv.y * 3.0 - time);
      color = vec4(sampleColor.rgb * sheen, sampleColor.a);
    }`));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
  gl.useProgram(program);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
  const timeLocation = gl.getUniformLocation(program, 'time');
  let allocatedWidth = 0;
  let allocatedHeight = 0;
  return {
    draw(time) {
      const b = measure(canvas);
      const image = snapshotSize(canvas);
      const w = Math.ceil(image.width);
      const h = Math.ceil(image.height);
      if (w < 1 || h < 1) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (w !== allocatedWidth || h !== allocatedHeight) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        allocatedWidth = w;
        allocatedHeight = h;
      }
      gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, form);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(Math.round(b.x * b.dpr), Math.round((canvas.clientHeight - b.y - b.height) * b.dpr), Math.round(b.width * b.dpr), Math.round(b.height * b.dpr));
      gl.uniform1f(timeLocation, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      syncGeometry(canvas, b);
    },
    destroy() {
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  };
}

async function createWebGPU(canvas, onLost) {
  if (!navigator.gpu || typeof canvas.updateElementGeometry !== 'function') throw new Error('WebGPU is unavailable');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No WebGPU adapter');
  const device = await adapter.requestDevice();
  if (typeof device.queue.drawElementImageToTexture !== 'function') {
    device.destroy();
    throw new Error('WebGPU HTML textures are unavailable');
  }
  const context = canvas.getContext('webgpu');
  if (!context) { device.destroy(); throw new Error('WebGPU context unavailable'); }
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });
  let destroyed = false;
  device.lost.then(() => { if (!destroyed) onLost(); });
  device.addEventListener('uncapturederror', onLost);
  const module = device.createShaderModule({ code: `
    struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f }
    @vertex fn vertexMain(@builtin(vertex_index) i: u32) -> Out {
      let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
      var o: Out;
      o.position = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
      o.uv = vec2f(p.x, 1.0 - p.y);
      return o;
    }
    @group(0) @binding(0) var image: texture_2d<f32>;
    @group(0) @binding(1) var imageSampler: sampler;
    @fragment fn fragmentMain(in: Out) -> @location(0) vec4f {
      return textureSample(image, imageSampler, in.uv);
    }` });
  const pipeline = device.createRenderPipeline({
    layout: 'auto', vertex: { module, entryPoint: 'vertexMain' },
    fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
    primitive: { topology: 'triangle-list' }
  });
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  let texture;
  let bindGroup;
  let allocatedWidth = 0;
  let allocatedHeight = 0;
  return {
    draw() {
      const b = measure(canvas);
      const image = snapshotSize(canvas);
      const width = Math.ceil(image.width);
      const height = Math.ceil(image.height);
      if (width < 1 || height < 1) return;
      if (width !== allocatedWidth || height !== allocatedHeight) {
        texture?.destroy();
        texture = device.createTexture({ size: [width, height, 1], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        allocatedWidth = width;
        allocatedHeight = height;
        bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
          { binding: 0, resource: texture.createView() }, { binding: 1, resource: sampler }
        ] });
      }
      device.queue.drawElementImageToTexture({ source: form }, { texture, size: [width, height, 1] });
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }] });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.setViewport(b.x * b.dpr, b.y * b.dpr, b.width * b.dpr, b.height * b.dpr, 0, 1);
      pass.draw(3);
      pass.end();
      device.queue.submit([encoder.finish()]);
      syncGeometry(canvas, b);
    },
    destroy() {
      destroyed = true;
      texture?.destroy();
      context.unconfigure();
      device.destroy();
    }
  };
}

async function selectMode(mode) {
  const token = ++generation;
  activeMode = mode;
  dispose();
  dispose = () => {};
  surface.replaceChildren(form);
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('#code-content').textContent = snippets[mode];
  $('#code-label').textContent = { '2d': 'The 2D starting point', webgl: 'Upload HTML to a WebGL texture', webgpu: 'Copy HTML into a WebGPU texture' }[mode];
  $('#copy').textContent = 'Copy code';
  if (!supportsHtmlInCanvas()) {
    status.textContent = `${mode === '2d' ? '2D Canvas' : mode === 'webgl' ? 'WebGL' : 'WebGPU'} preview: native HTML fallback. This browser lacks HTML-in-Canvas.`;
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.setAttribute('content', 'drawable');
  canvas.className = 'render-canvas';
  canvas.append(form);
  surface.append(canvas);
  status.textContent = 'Preparing live HTML rendering…';
  let renderer;
  let resize;
  let frame = 0;
  let watchdog;
  let painted = false;
  let stopped = false;
  const fail = () => {
    if (token === generation && !stopped) showFallback('Canvas rendering is unavailable. Your form is still interactive in native HTML.');
  };
  const cleanup = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    resize?.disconnect();
    canvas.onpaint = null;
    canvas.removeEventListener('webglcontextlost', fail);
    renderer?.destroy();
  };
  dispose = cleanup;
  try {
    renderer = mode === '2d' ? create2D(canvas) : mode === 'webgl' ? createWebGL(canvas) : await createWebGPU(canvas, fail);
    if (token !== generation || stopped) { renderer.destroy(); return; }
    canvas.addEventListener('webglcontextlost', fail);
    canvas.onpaint = () => {
      try {
        renderer.draw(motion.checked && !reducedMotion.matches ? performance.now() / 1000 : 0);
        if (!painted) {
          painted = true;
          clearTimeout(watchdog);
          status.textContent = `Live ${mode === '2d' ? '2D Canvas' : mode === 'webgl' ? 'WebGL' : 'WebGPU'} rendering. Native HTML, drawn inside canvas.`;
        }
      } catch { fail(); }
    };
    resize = new ResizeObserver(([entry]) => {
      const box = entry.devicePixelContentBoxSize?.[0];
      canvas.width = Math.max(1, box?.inlineSize ?? Math.round(entry.contentRect.width * devicePixelRatio));
      canvas.height = Math.max(1, box?.blockSize ?? Math.round(entry.contentRect.height * devicePixelRatio));
      canvas.requestPaint();
    });
    try { resize.observe(canvas, { box: 'device-pixel-content-box' }); }
    catch { resize.observe(canvas); }
    const animate = () => {
      if (stopped) return;
      if (visible && !document.hidden && motion.checked && !reducedMotion.matches) canvas.requestPaint();
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    watchdog = setTimeout(() => { if (!painted) fail(); }, 2500);
    canvas.requestPaint();
  } catch { fail(); }
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => selectMode(button.dataset.mode)));
form.addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#demo-name').value.trim();
  $('#form-result').textContent = name ? `Hello, ${name}. This is your canvas.` : 'Add your name to make it yours.';
  burst = 1;
});
$('#reset').addEventListener('click', () => {
  form.reset();
  $('#form-result').textContent = 'Try typing, tabbing, and clicking.';
  burst = 0;
  selectMode(activeMode);
});
$('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(snippets[activeMode]);
    $('#copy').textContent = 'Copied';
  } catch { $('#copy').textContent = 'Select the code to copy'; }
});
reducedMotion.addEventListener('change', () => { motion.checked = !reducedMotion.matches; });
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }).observe(stage);

// This separate, decorative canvas never snapshots or imitates the form.
const ambient = $('#ambient');
const ctx = ambient.getContext('2d');
const theme = getComputedStyle(document.documentElement);
const lineColor = theme.getPropertyValue('--mint-line').trim();
const accent = theme.getPropertyValue('--green').trim();
let burst = 0;
let pointer = { x: 0.5, y: 0.5 };
let ambientDirty = true;
stage.addEventListener('pointermove', event => {
  const rect = stage.getBoundingClientRect();
  pointer = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
});
new ResizeObserver(() => {
  ambient.width = Math.round(stage.clientWidth * devicePixelRatio);
  ambient.height = Math.round(stage.clientHeight * devicePixelRatio);
  ambientDirty = true;
}).observe(stage);
function drawAmbient(now) {
  requestAnimationFrame(drawAmbient);
  const moving = motion.checked && !reducedMotion.matches;
  if (!ctx || !visible || document.hidden || (!moving && !ambientDirty)) return;
  ambientDirty = false;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const t = moving ? now / 2400 : 0;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  for (let row = 0; row < 13; row++) {
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 10) {
      const envelope = Math.sin(x / w * Math.PI);
      const y = h * 0.52 + (row - 6) * 16 + Math.sin(x / 130 + t + row * 0.13) * (38 + burst * 35) * envelope;
      if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(w * (0.46 + pointer.x * 0.08), h * 0.53, w * (0.25 + i * 0.035), 100 + i * 22, -0.13 + Math.sin(t) * 0.04, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  burst *= 0.97;
}
motion.addEventListener('change', () => { ambientDirty = true; });
reducedMotion.addEventListener('change', () => { ambientDirty = true; });
requestAnimationFrame(drawAmbient);
selectMode('2d');
