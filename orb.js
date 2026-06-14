/* ============================================================
   OrbGL — the dream orb as a WebGL crystal ball
   - footage (image or video) mapped onto a refracting sphere
   - idle liquid wobble (ぷるぷる) + pointer pinch/hole (ぬるっと)
   - radial chromatic aberration, rim shading, specular highlight
   - one persistent canvas/context; setMedia() swaps the texture
   ============================================================ */
window.OrbGL = (function () {
  let gl, prog, buf, tex, canvas, raf = null;
  let mouse = [0.5, 0.5], energy = 0, t = 0;
  let video = null, imgReady = false, fallback = [0.1, 0.1, 0.12];
  let u = {};

  const VS = `attribute vec2 p; varying vec2 uv;
    void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.0,1.0); }`;

  const FS = `precision mediump float;
    varying vec2 uv;
    uniform sampler2D tex; uniform vec2 mouse; uniform float energy;
    uniform float time; uniform float hasTex; uniform vec3 fallback;
    void main(){
      vec2 c = (uv*2.0-1.0) * 1.04;
      float r = length(c);
      float ang = atan(c.y, c.x);
      // gentle idle undulation + springy "ぷるっ" when poked
      float idle = 0.018*sin(ang*3.0 + time*0.8) + 0.012*sin(ang*5.0 - time*0.6);
      float jiggle = energy * 0.085 * sin(ang*2.0 + time*5.0);   // organic swell, a touch bolder
      float edge = 0.90 + idle + jiggle;
      if(r > edge){ discard; }
      float rn = r/edge;
      vec2 cn = c/edge;
      float z = sqrt(max(0.0001, 1.0 - rn*rn));     // sphere height
      vec2 refr = cn * (0.62 + 0.38*z);             // crystal refraction
      vec2 suv = refr*0.5+0.5;
      suv.x += 0.008*sin(uv.y*9.0 + time*1.3);
      suv.y += 0.008*cos(uv.x*9.0 + time*1.1);
      suv += normalize(c + 1e-5) * energy * 0.006 * sin(r*9.0 - time*5.0);   // gentle organic ripple
      vec2 dir = normalize(c + 1e-5);
      float ca = 0.004 + 0.02*energy;
      vec3 col;
      if(hasTex > 0.5){
        col = vec3(texture2D(tex, suv+dir*ca).r, texture2D(tex, suv).g, texture2D(tex, suv-dir*ca).b);
      } else {
        col = fallback * (0.85 + 0.35*z);
      }
      float hl = smoothstep(0.40, 0.0, length(c - vec2(-0.30, 0.34)));
      col += vec3(1.0) * hl * 0.13;                 // gentle specular, no dark rim
      float a = smoothstep(edge, edge-0.12, r);     // soft edge, dissolves into bg
      gl_FragColor = vec4(col, a);
    }`;

  function compile(type, src) {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.warn("orb shader:", gl.getShaderInfoLog(sh));
    return sh;
  }

  function init(cv) {
    canvas = cv;
    gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, "p"); gl.linkProgram(prog); gl.useProgram(prog);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    u = { tex: gl.getUniformLocation(prog, "tex"), mouse: gl.getUniformLocation(prog, "mouse"),
      energy: gl.getUniformLocation(prog, "energy"), time: gl.getUniformLocation(prog, "time"),
      hasTex: gl.getUniformLocation(prog, "hasTex"), fallback: gl.getUniformLocation(prog, "fallback") };
    tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const setM = (e) => {
      const rc = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rc.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rc.top;
      mouse = [cx / rc.width, 1.0 - cy / rc.height]; energy = 1.0;
      if (e.cancelable) e.preventDefault();
    };
    canvas.addEventListener("pointermove", setM);
    canvas.addEventListener("pointerdown", setM);
    if (!raf) loop();
    return true;
  }

  function setMedia(imgUrl, vidUrl, fb) {
    if (!gl) return;
    fallback = fb || fallback;
    imgReady = false; gl.uniform1f(u.hasTex, 0);
    if (video) { try { video.pause(); } catch (e) {} video.src = ""; video = null; }
    // try video first
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
    v.oncanplay = () => { video = v; imgReady = true; v.play().catch(() => {}); };
    v.onerror = () => { loadImage(imgUrl); };
    v.src = vidUrl;
    // image (used until/unless video is ready)
    loadImage(imgUrl);
  }
  function loadImage(url) {
    const im = new Image();
    im.onload = () => { if (video) return; gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); imgReady = true; };
    im.onerror = () => { imgReady = false; };
    im.src = url;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!gl) return;
    t += 0.016; energy *= 0.93;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 360, h = canvas.clientHeight || 360;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); gl.viewport(0, 0, canvas.width, canvas.height); }
    if (video && video.readyState >= 2) { gl.bindTexture(gl.TEXTURE_2D, tex); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); } catch (e) {} }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2fv(u.mouse, mouse); gl.uniform1f(u.energy, energy); gl.uniform1f(u.time, t);
    gl.uniform1f(u.hasTex, imgReady ? 1 : 0); gl.uniform3fv(u.fallback, fallback);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return { init, setMedia, ok: () => !!gl };
})();
