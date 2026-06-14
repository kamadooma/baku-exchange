/* ============================================================
   FieldGL — Dreamfield の群体オーブ（WebGL）
   多数の夢オーブを1枚のキャンバスに描画。各オーブは映像テクスチャ＋
   油膜のように揺れる輪郭・屈折・色収差。位置と反発は app.js 側の物理で。
   ============================================================ */
window.FieldGL = (function () {
  let gl, prog, buf, canvas, u = {};

  const VS = `attribute vec2 q; uniform vec2 uCenter; uniform float uRad; uniform vec2 uRes; varying vec2 uv;
    void main(){ uv = q; vec2 px = uCenter + q*uRad;
      vec2 cl = vec2(px.x/uRes.x*2.0-1.0, 1.0 - px.y/uRes.y*2.0);
      gl_Position = vec4(cl, 0.0, 1.0); }`;

  const FS = `precision mediump float;
    varying vec2 uv;
    uniform sampler2D tex; uniform float time; uniform float seed; uniform float hasTex; uniform vec3 fallback;
    void main(){
      vec2 c = uv;
      float r = length(c);
      float ang = atan(c.y, c.x);
      float s = seed * 6.2832;
      // なめらかな油滴：低周波だけで、ゆっくり卵形に波打つ（角ばらせない）
      float wob = 0.05*sin(ang + time*0.40 + s) + 0.03*sin(ang*2.0 - time*0.30 + s*1.7);
      float edge = 0.84 + wob;
      if(r > edge){ discard; }
      float rn = r/edge; vec2 cn = c/edge;
      float z = sqrt(max(0.0001, 1.0 - rn*rn));
      vec2 suv = vec2(cn.x * 0.5 + 0.5, 0.5 - cn.y * 0.5);   // cover＋Y反転（上下を正す）
      suv.x += 0.008*sin(uv.y*8.0 + time*1.1 + s);
      suv.y += 0.008*cos(uv.x*8.0 + time*0.9 + s);
      vec2 dir = normalize(c + 1e-5); float ca = 0.006;
      vec3 col;
      if(hasTex > 0.5){
        col = vec3(texture2D(tex, suv+dir*ca).r, texture2D(tex, suv).g, texture2D(tex, suv-dir*ca).b);
      } else {
        float a1 = sin(c.x*1.6 + time*0.25 + s)*0.5+0.5;
        float a2 = sin(c.y*1.9 - time*0.20 + s*1.3)*0.5+0.5;
        col = mix(fallback, fallback.gbr*0.9 + 0.05, a1) + 0.08*vec3(a2, a1, a2);
      }
      float hl = smoothstep(0.4, 0.0, length(c - vec2(-0.3, 0.34)));
      col += vec3(1.0) * hl * 0.16;
      float al = smoothstep(edge, edge-0.18, r);     // やわらかく溶ける縁
      gl_FragColor = vec4(col, al);
    }`;

  function compile(t, src) { const sh = gl.createShader(t); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("field shader:", gl.getShaderInfoLog(sh)); return sh; }

  function init(cv) {
    canvas = cv;
    gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, "q"); gl.linkProgram(prog); gl.useProgram(prog);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    u = {}; ["uCenter", "uRad", "uRes", "tex", "time", "seed", "hasTex", "fallback"].forEach((n) => u[n] = gl.getUniformLocation(prog, n));
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
    return true;
  }

  function loadTexture(url) {
    const obj = { tex: gl.createTexture(), ready: false, hasTex: 0 };
    gl.bindTexture(gl.TEXTURE_2D, obj.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 20, 24, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const im = new Image();
    im.onload = () => { gl.bindTexture(gl.TEXTURE_2D, obj.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); obj.ready = true; obj.hasTex = 1; } catch (e) {} };
    im.onerror = () => {};
    im.src = url;
    return obj;
  }

  function begin() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog); gl.uniform2f(u.uRes, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function draw(x, y, r, seed, texObj, fb, time) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texObj.tex); gl.uniform1i(u.tex, 0);
    gl.uniform2f(u.uCenter, x, y); gl.uniform1f(u.uRad, r); gl.uniform1f(u.seed, seed);
    gl.uniform1f(u.time, time); gl.uniform1f(u.hasTex, texObj.hasTex); gl.uniform3fv(u.fallback, fb);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { init, loadTexture, begin, draw, ok: () => !!gl };
})();
