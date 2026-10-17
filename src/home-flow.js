/* Home background: four pools of pop-art "liquid" in the corners, drawn by a
   WebGL shader. Their edges wave and travel, halftone dots ripple through them
   and fade out past their edges, sparkles twinkle on the paper, and taps send
   ripples through the water (homeFlow.ripple). Without WebGL the SVG water in
   index.html stays visible instead. Tuning: CONFIG.home.flow. */
(() => {
  const home = document.getElementById('homeScreen');
  const canvas = document.getElementById('homeFlow');
  if (!home || !canvas) return;
  const T = CONFIG.home.flow;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const MAX_RIPPLES = 6;

  const vertex = 'attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}';
  const fragment = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 res;          // canvas size, device px
uniform float dpr;
uniform float time;        // seconds, already scaled by CONFIG speed
uniform float intro;       // 0..1 pools growing in from the corners
uniform vec4 ripples[${MAX_RIPPLES}]; // x, y (css px), start time, strength
uniform float dotSpacing;  // css px
uniform float rippleSpeed; // css px per second

const vec3 CREAM = vec3(1.0, .980, .941);

vec2 flow(vec2 q, float t) {
  vec2 w = vec2(sin(q.y*3.3 + t*.6) + .5*sin(q.x*5.1 - t*.9 + 1.7),
                cos(q.x*2.9 - t*.5) + .5*cos(q.y*4.7 + t*.8 + .4));
  vec2 q2 = q + .06*w;
  return w + .6*vec2(sin(q2.y*8.0 - t*1.3), cos(q2.x*7.0 + t*1.1));
}

// Signed elliptical distance to a corner pool's edge (negative inside).
float pool(vec2 uv, vec2 anchor, vec2 radius, float ph, float t) {
  vec2 d = (uv - anchor) / (radius * mix(.45, .93, intro));
  float len = length(d);
  vec2 n = d / max(len, 1e-4);
  float wave = .060*sin(n.x*5.0 - n.y*3.0 + t*.70 + ph)
             + .040*sin(n.y*7.0 + n.x*2.0 - t*1.1 + ph*2.3)
             + .022*sin((n.x + n.y)*13.0 + t*1.7 + ph);
  return len - (1.0 + wave + .05*sin(t*.4 + ph));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }

// Halftone dot coverage at css position p for a dot radius r (css px).
float halftone(vec2 p, float r) {
  vec2 g = mat2(.7071, -.7071, .7071, .7071)*p / dotSpacing;
  float dist = length(fract(g) - .5)*dotSpacing;
  return clamp((r - dist)*dpr + .5, 0., 1.)*smoothstep(0., .4, r);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y);
  vec2 css = px / dpr;
  vec2 size = res / dpr;
  vec2 uv = px / res;
  vec2 q = (px - .5*res) / res.y;
  float t = time;

  // Taps push the water outward as a ring travels across it.
  vec2 push = vec2(0.);
  float rings = 0.;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = ripples[i];
    float age = t - rp.z;
    if (rp.w <= 0. || age < 0. || age > 1.8) continue;
    vec2 v = css - rp.xy;
    float dist = length(v);
    float radius = rippleSpeed*age;
    float fade = rp.w*exp(-age*1.9);
    float band = exp(-pow((dist - radius)/46., 2.));
    push += v/max(dist, 1.)*band*fade*16.;
    rings += fade*(exp(-pow((dist - radius)/2.2, 2.)) + .6*exp(-pow((dist - radius*.72)/1.8, 2.)));
  }

  vec2 w = flow(q, t);
  vec2 wuv = uv + vec2(w.x*.012*res.y/res.x, w.y*.012) - push/size;

  vec3 col = CREAM;
  float covered = 0.;

  // Pools: anchor, radius (uv), phase, edge colour, deep colour, dot colour.
  for (int i = 0; i < 4; i++) {
    vec2 anchor; vec2 radius; float ph; vec3 edge; vec3 deep; vec3 dotc; float dotA;
    if (i == 0) { anchor = vec2(0., 1.); radius = vec2(.58, .34); ph = 0.0;
      edge = vec3(.33, .76, 1.); deep = mix(vec3(.18, .43, 1.), vec3(.17, .81, .93), .5 + .5*sin(t*.23));
      dotc = vec3(.03, .47, .84); dotA = .42; }
    else if (i == 1) { anchor = vec2(1., 0.); radius = vec2(.32, .34); ph = 2.1;
      edge = vec3(1., .95, .62); deep = vec3(1., .86, .12); dotc = vec3(.97, .64, .0); dotA = .38; }
    else if (i == 2) { anchor = vec2(0., 0.); radius = vec2(.30, .26); ph = 4.2;
      edge = vec3(1., .67, .82); deep = mix(vec3(1., .19, .51), vec3(1., .40, .53), .5 + .5*sin(t*.31 + 1.));
      dotc = vec3(.85, .11, .47); dotA = .40; }
    else { anchor = vec2(1., 1.); radius = vec2(.33, .25); ph = 5.6;
      edge = vec3(1., .67, .82); deep = vec3(1., .22, .53); dotc = vec3(.85, .11, .47); dotA = .40; }

    float f = pool(wuv, anchor, radius, ph, t);
    float fw = max(fwidth(f), 1e-5);
    float inside = -f/fw/dpr;      // css px inside the edge (negative outside)
    float a = clamp(inside*dpr + .5, 0., 1.);

    // Outside: soft coloured shadow and a halftone spray fading into the paper.
    if (inside < 0.) {
      float o = -inside;
      col = mix(col, deep, .10*(1. - smoothstep(0., 26., o)));
      float r = dotSpacing*.27*pow(max(0., 1. - o/58.), 1.3);
      col = mix(col, dotc, .55*halftone(css, r));
    }

    // Inside: depth gradient, travelling sheen, halftone, glossy rim, crisp lip.
    float k = clamp(-f*1.4, 0., 1.);
    vec3 fill = mix(edge, deep, smoothstep(0., .9, k));
    fill += .10*k*smoothstep(.78, 1., sin(dot(css, vec2(.011, .006)) + t*1.1 + ph));
    float wave = .5 + .5*sin(dot(css, vec2(.021, .013)) - t*2.2 + ph);
    float r = dotSpacing*(.12 + .20*k + .06*wave);
    fill = mix(fill, dotc, dotA*halftone(css, r));
    float rim = smoothstep(2.6, 3.6, inside)*(1. - smoothstep(5.6, 7.2, inside));
    fill = mix(fill, vec3(1.), .45*rim);
    fill = mix(fill, deep*.86, .35*(1. - smoothstep(.8, 2.2, inside)));
    col = mix(col, fill, a);
    covered = max(covered, a);
  }

  // Twinkling four-point sparkles on the paper.
  vec2 cell = floor(css/180.);
  float h = hash(cell);
  if (h < .38) {
    vec2 centre = (cell + .2 + .6*vec2(hash(cell + 7.1), hash(cell + 3.7)))*180.;
    float tw = pow(max(0., sin(t*(.7 + h*1.4) + h*40.)), 6.);
    float s = 3. + 7.*tw;
    vec2 v = css - centre;
    float star = max(1. - (abs(v.x)/s + abs(v.y)/(s*.24)), 1. - (abs(v.y)/s + abs(v.x)/(s*.24)));
    float sa = clamp(star*s*dpr*.5, 0., 1.)*tw*(1. - covered);
    col = mix(col, mix(vec3(1., .78, .12), vec3(1.), smoothstep(.55, .9, star)), sa*.9);
  }

  // Visible ripple rings: pink on paper, white on water.
  col = mix(col, mix(vec3(1., .18, .43), vec3(1.), covered), clamp(rings, 0., 1.)*.38);

  gl_FragColor = vec4(col, 1.);
}`;

  let gl, program, uniforms = {}, frame = 0, previous = 0, elapsed = 3, introStart = -1, scale = 1, slowFrames = 0, failed = false;
  const ripples = new Float32Array(MAX_RIPPLES * 4);
  let nextRipple = 0;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  function initialize() {
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
      if (!gl || !gl.getExtension('OES_standard_derivatives')) throw new Error('WebGL with derivatives unavailable');
      program = gl.createProgram();
      const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['res', 'dpr', 'time', 'intro', 'ripples', 'dotSpacing', 'rippleSpeed']) uniforms[name] = gl.getUniformLocation(program, name);
      canvas.dataset.renderer = 'webgl';
      home.classList.add('home--flow');
      resize();
      sync();
    } catch (error) {
      failed = true;
      program = null;
      canvas.dataset.renderer = 'fallback';
      home.classList.remove('home--flow');
      console.warn('Home background uses the SVG fallback:', error.message);
    }
  }

  function introLevel() {
    if (introStart < 0) return 1;
    const p = Math.min(1, (performance.now() - introStart) / T.introDuration);
    return 1 - Math.pow(1 - p, 3);
  }

  function render() {
    if (!program || gl.isContextLost()) return;
    const ratio = canvas.width / Math.max(1, canvas.clientWidth);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.res, canvas.width, canvas.height);
    gl.uniform1f(uniforms.dpr, ratio);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.intro, introLevel());
    gl.uniform4fv(uniforms.ripples, ripples);
    gl.uniform1f(uniforms.dotSpacing, T.dotSpacing);
    gl.uniform1f(uniforms.rippleSpeed, T.rippleSpeed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function resize() {
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, T.maxPixelRatio, Math.sqrt(T.maxPixels / (width * height))) * scale;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    render();
  }

  function running() {
    return !!program && !document.hidden && document.body.dataset.screen === 'home' && !home.hidden && !reduce.matches;
  }

  function tick(now) {
    frame = requestAnimationFrame(tick);
    if (previous) {
      const dt = now - previous;
      elapsed += Math.min(dt / 1000, 0.1) * T.speed;
      // Hold the frame rate on slower iPads by drawing fewer pixels.
      slowFrames = dt > 24 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 45 && scale > 0.6) {
        scale -= 0.15;
        slowFrames = 0;
        resize();
      }
    }
    previous = now;
    render();
  }

  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (!program || gl.isContextLost()) return;
    canvas.dataset.motion = running() ? 'running' : 'paused';
    render();
    if (running()) frame = requestAnimationFrame(tick);
  }

  window.homeFlow = {
    /* A ripple at client coordinates; strength 0..1. */
    ripple(clientX, clientY, strength = 1) {
      if (!program || reduce.matches) return;
      const box = canvas.getBoundingClientRect();
      ripples.set([clientX - box.left, clientY - box.top, elapsed, strength], nextRipple * 4);
      nextRipple = (nextRipple + 1) % MAX_RIPPLES;
    },
    /* Pools grow in from the corners (opening screen). */
    intro() {
      if (reduce.matches || failed) return;
      introStart = performance.now();
    },
  };

  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); cancelAnimationFrame(frame); program = null; });
  canvas.addEventListener('webglcontextrestored', initialize);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  reduce.addEventListener('change', sync);
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  new ResizeObserver(resize).observe(canvas);
  initialize();
})();
