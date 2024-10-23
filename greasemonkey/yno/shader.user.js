// ==UserScript==
// @name         YNO Shaders
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Basic WebGL shaders for YNO
// @author       Desdaemon
// @match        https://ynoproject.net/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ynoproject.net
// @license      MIT
// @supportURL   https://github.com/Desdaemon/userscripts
// @downloadURL  https://raw.githubusercontent.com/Desdaemon/userscripts/refs/heads/main/greasemonkey/yno/shader.user.js
// @updateURL    https://raw.githubusercontent.com/Desdaemon/userscripts/refs/heads/main/greasemonkey/yno/shader.user.js
// @grant        none
// ==/UserScript==

async function awaitInit() {
  while (!window.loadOrInitConfig)
    await new Promise(resolve => setTimeout(resolve, 3000));
}

(function runShaders(initDone) {
  'use strict';
  if (!initDone)
    return awaitInit().then(() => runShaders(true));
  const gl = canvas.getContext('webgl');
  if (!gl) return;

  const oes = gl.getExtension('OES_vertex_array_object');
  if (!oes) {
    showToastMessage('Shaders require OES_vertex_array_object, which your browser does not support yet.', 'info', true, undefined, true);
    return;
  }

  function createProgram(vertexSrc, fragmentSrc) {
    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSrc);
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSrc);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Error linking program:", gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Error compiling shader:", gl.getShaderInfoLog(shader));
      return null;
    }

    return shader;
  }

  const noopVertexSource = `
attribute vec4 a_position;
varying vec2 v_texCoords;
uniform mat4 MVP;

void main() {
  gl_Position = a_position * MVP;
  v_texCoords = (a_position.xy + 1.0) * 0.5;
}`;

  const programNoop = createProgram(noopVertexSource, `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoords;

void main() {
  gl_FragColor = texture2D(u_texture, v_texCoords);
}`);

  /*
 Below is a modified version of crt-mattias, available at:
 https://raw.githubusercontent.com/libretro/slang-shaders/refs/heads/master/crt/shaders/crt-mattias.slang
*/

  // Add new programs here, then for any configurable uniforms add them to shaderKnobs down below.

  const crtVertexSource = `
precision mediump float;
uniform mat4 MVP;

attribute vec4 a_position;
varying vec2 v_texCoords;
#define Position a_position
#define vTexCoord v_texCoords

void main()
{
   gl_Position = Position * MVP;
   vTexCoord = (Position.xy + 1.0) * 0.5;
}`;

  const programCRT = createProgram(crtVertexSource, `
precision mediump float;

uniform float CURVATURE;
uniform float SCANSPEED;

uniform vec2 SourceSize;
uniform vec2 OutputSize;
uniform int FrameCount;

uniform sampler2D u_texture;
uniform float u_time;
varying vec2 v_texCoords;
#define Source u_texture
#define vTexCoord v_texCoords

#define iChannel0 Source
#define iTime (float(FrameCount) / 60.0)
#define iResolution (OutputSize.xy)
#define fragCoord (vTexCoord.xy * OutputSize.xy)

vec3 sample_( sampler2D tex, vec2 tc )
{
	vec3 s = pow(texture2D(tex,tc).rgb, vec3(2.2));
	return s;
}

vec3 blur(sampler2D tex, vec2 tc, float offs)
{
	vec4 xoffs = offs * vec4(-2.0, -1.0, 1.0, 2.0) / iResolution.x;
	vec4 yoffs = offs * vec4(-2.0, -1.0, 1.0, 2.0) / iResolution.y;

	vec3 color = vec3(0.0, 0.0, 0.0);
	color += sample_(tex,tc + vec2(xoffs.x, yoffs.x)) * 0.00366;
	color += sample_(tex,tc + vec2(xoffs.y, yoffs.x)) * 0.01465;
	color += sample_(tex,tc + vec2(    0.0, yoffs.x)) * 0.02564;
	color += sample_(tex,tc + vec2(xoffs.z, yoffs.x)) * 0.01465;
	color += sample_(tex,tc + vec2(xoffs.w, yoffs.x)) * 0.00366;

	color += sample_(tex,tc + vec2(xoffs.x, yoffs.y)) * 0.01465;
	color += sample_(tex,tc + vec2(xoffs.y, yoffs.y)) * 0.05861;
	color += sample_(tex,tc + vec2(    0.0, yoffs.y)) * 0.09524;
	color += sample_(tex,tc + vec2(xoffs.z, yoffs.y)) * 0.05861;
	color += sample_(tex,tc + vec2(xoffs.w, yoffs.y)) * 0.01465;

	color += sample_(tex,tc + vec2(xoffs.x, 0.0)) * 0.02564;
	color += sample_(tex,tc + vec2(xoffs.y, 0.0)) * 0.09524;
	color += sample_(tex,tc + vec2(    0.0, 0.0)) * 0.15018;
	color += sample_(tex,tc + vec2(xoffs.z, 0.0)) * 0.09524;
	color += sample_(tex,tc + vec2(xoffs.w, 0.0)) * 0.02564;

	color += sample_(tex,tc + vec2(xoffs.x, yoffs.z)) * 0.01465;
	color += sample_(tex,tc + vec2(xoffs.y, yoffs.z)) * 0.05861;
	color += sample_(tex,tc + vec2(    0.0, yoffs.z)) * 0.09524;
	color += sample_(tex,tc + vec2(xoffs.z, yoffs.z)) * 0.05861;
	color += sample_(tex,tc + vec2(xoffs.w, yoffs.z)) * 0.01465;

	color += sample_(tex,tc + vec2(xoffs.x, yoffs.w)) * 0.00366;
	color += sample_(tex,tc + vec2(xoffs.y, yoffs.w)) * 0.01465;
	color += sample_(tex,tc + vec2(    0.0, yoffs.w)) * 0.02564;
	color += sample_(tex,tc + vec2(xoffs.z, yoffs.w)) * 0.01465;
	color += sample_(tex,tc + vec2(xoffs.w, yoffs.w)) * 0.00366;

	return color;
}

//Canonical noise function; replaced to prevent precision errors
//float rand(vec2 co){
//    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
//}

float rand(vec2 co)
{
    float a = 12.9898;
    float b = 78.233;
    float c = 43758.5453;
    float dt= dot(co.xy ,vec2(a,b));
    float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
}

vec2 curve(vec2 uv)
{
	uv = (uv - 0.5) * 2.0;
	uv *= 1.1;
	uv.x *= 1.0 + pow((abs(uv.y) / 5.0), 2.0);
	uv.y *= 1.0 + pow((abs(uv.x) / 4.0), 2.0);
	uv  = (uv / 2.0) + 0.5;
	uv =  uv *0.92 + 0.04;
	return uv;
}

void main()
{
    vec2 q = fragCoord.xy / iResolution.xy;
    vec2 uv = q;
    uv = mix( uv, curve( uv ), CURVATURE );
    vec3 oricol = texture2D( iChannel0, vec2(q.x,q.y) ).xyz;
    vec3 col;
	float x =  sin(0.1*iTime+uv.y*21.0)*sin(0.23*iTime+uv.y*29.0)*sin(0.3+0.11*iTime+uv.y*31.0)*0.0017;
	float o =2.0*mod(fragCoord.y,2.0)/iResolution.x;
	x+=o;
    col.r = 1.0*blur(iChannel0,vec2(uv.x+0.0009,uv.y+0.0009),1.2).x+0.005;
    col.g = 1.0*blur(iChannel0,vec2(uv.x+0.000,uv.y-0.0015),1.2).y+0.005;
    col.b = 1.0*blur(iChannel0,vec2(uv.x-0.0015,uv.y+0.000),1.2).z+0.005;
    col.r += 0.2*blur(iChannel0,vec2(uv.x+0.0009,uv.y+0.0009),2.25).x-0.005;
    col.g += 0.2*blur(iChannel0,vec2(uv.x+0.000,uv.y-0.0015),1.75).y-0.005;
    col.b += 0.2*blur(iChannel0,vec2(uv.x-0.0015,uv.y+0.000),1.25).z-0.005;
    float ghs = 0.05;
	col.r += ghs*(1.0-0.299)*blur(iChannel0,0.75*vec2(0.01, -0.027)+vec2(uv.x+0.001,uv.y+0.001),7.0).x;
    col.g += ghs*(1.0-0.587)*blur(iChannel0,0.75*vec2(-0.022, -0.02)+vec2(uv.x+0.000,uv.y-0.002),5.0).y;
    col.b += ghs*(1.0-0.114)*blur(iChannel0,0.75*vec2(-0.02, -0.0)+vec2(uv.x-0.002,uv.y+0.000),3.0).z;

    col = clamp(col*0.4+0.6*col*col*1.0,0.0,1.0);

    float vig = (0.0 + 1.0*16.0*uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y));
	vig = pow(vig,0.3);
	col *= vec3(vig);

    col *= vec3(0.95,1.05,0.95);
	col = mix( col, col * col, 0.3) * 3.8;

	float scans = clamp( 0.35+0.15*sin(3.5*(iTime * SCANSPEED)+uv.y*iResolution.y*1.5), 0.0, 1.0);

	float s = pow(scans,0.9);
	col = col*vec3( s) ;

    col *= 1.0+0.0015*sin(300.0*iTime);

	col*=1.0-0.15*vec3(clamp((mod(fragCoord.x+o, 2.0)-1.0)*2.0,0.0,1.0));
	col *= vec3( 1.0 ) - 0.25*vec3( rand( uv+0.0001*iTime),  rand( uv+0.0001*iTime + 0.3 ),  rand( uv+0.0001*iTime+ 0.5 )  );
	col = pow(col, vec3(0.45));

	if (uv.x < 0.0 || uv.x > 1.0)
		col *= 0.0;
	if (uv.y < 0.0 || uv.y > 1.0)
		col *= 0.0;


    float comp = smoothstep( 0.1, 0.9, sin(iTime) );

    gl_FragColor = vec4(col,1.0);
}`);

  const programSepia = createProgram(noopVertexSource, `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_texCoords;

void main() {
  vec2 uv = v_texCoords * 2.0 - 1.0;
  uv = uv * 0.5 + 0.5;

  vec4 color = texture2D(u_texture, uv);

  // Convert the color to sepia tone
  float r = color.r;
  float g = color.g;
  float b = color.b;

  // Sepia tone matrix
  float newR = (r * 0.393) + (g * 0.769) + (b * 0.189);
  float newG = (r * 0.349) + (g * 0.686) + (b * 0.168);
  float newB = (r * 0.272) + (g * 0.534) + (b * 0.131);

  // Set the final color
  gl_FragColor = vec4(newR, newG, newB, 1.0);
}`);

  /** See {@linkcode shaderKnobs} for example usage. */
  class Param {
    constructor(defaultValue, min, max, step, onUpdate = gl.uniform1f.bind(gl)) {
      this.defaultValue = defaultValue;
      this.min = min;
      this.max = max;
      this.step = step;
      this.onUpdate = onUpdate;
    }
    initValue(name, reset = false) {
      const activeProgram = shaderConfig.active;
      if (shaderKnobs[activeProgram][name] !== this)
        return;
      let value = shaderConfig.params[activeProgram][name];
      if (typeof value !== 'number' || reset)
        value = this.defaultValue;
      if (reset) {
        shaderConfig.params[activeProgram][name] = value;
        const input = document.querySelector(`input[name=${name}]`);
        if (input)
          input.value = value;
      }
      this.onUpdate(gl.getUniformLocation(shaderPrograms[activeProgram], name), value);
    }
    init($parent, name, program, configNamespace) {
      let value = shaderConfig.params[shaderConfig.active][name];
      if (typeof value !== 'number')
        value = this.defaultValue;

      const input = document.createElement('input');
      input.type = 'range';
      input.name = name;
      input.classList.add('slider');
      input.min = this.min;
      input.max = this.max;
      input.step = this.step;
      input.value = value;
      input.oninput = (ev) => {
        shaderConfig.params[configNamespace][name] = +ev.target.value;
        this.onUpdate(gl.getUniformLocation(program, name), +ev.target.value);
        debouncedSaveConfig();
      };

      const row = document.createElement('li');
      row.classList.add('formControlRow');
      row.insertAdjacentHTML('afterbegin', `<label class="unselectable" for="${name}">${name}</label>`);
      row.appendChild(input)
      $parent.appendChild(row);
      return row;
    }
  }

  // TODO: Allow enabling multiple shaders at the same time + change orders
  const shaderPrograms = {
    crt: programCRT,
    sepia: programSepia,
  }


  const shaderKnobs = {
    '': {},
    crt: {
      OutputSize: new Param(80, 10, 180, 5, (loc, value) => gl.uniform2f(loc, 20 * value, 15 * value)),
      CURVATURE: new Param(0.5, 0, 1, 0.05),
      SCANSPEED: new Param(1, 0, 10, 0.5),
    },
    sepia: {}
  }

  const shaderConfig = {
    /** @type {'crt' | 'sepia' | undefined} */
    active: 'crt',
    params: { "": {}, crt: {}, sepia: {} }
  };

  loadOrInitConfig(shaderConfig, true, 'shader');
  // @ts-expect-error
  if (shaderConfig.active === true) {
    shaderConfig.active = 'crt';
    updateConfig(shaderConfig, true, 'shader');
  }

  function debouncedSaveConfig() {
    // @ts-ignore
    clearTimeout(debouncedSaveConfig.handle);
    // @ts-ignore
    debouncedSaveConfig.handle = setTimeout(() => updateConfig(shaderConfig, true, 'shader'), 1000);
  }

  function matmult(a, b) {
    const result = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        for (let i = 0; i < 4; i++) {
          result[row * 4 + col] += a[row * 4 + i] * b[i * 4 + col];
        }
      }
    }
    return result;
  }

  let programChanged = false;
  function applyShader() {
    programChanged = false;
    const prog = shaderPrograms[shaderConfig.active] || programNoop;
    if (shaderConfig.active && prog === programNoop)
      showToastMessage(`Invalid shader program ${shaderConfig.active}`, 'important', true, undefined, true);
    const vao = setupConstantUniforms(prog);

    gl.uniform2f(gl.getUniformLocation(prog, 'SourceSize'), 320, 240);

    // const u_time = gl.getUniformLocation(prog, 'u_time');
    const u_framecount = gl.getUniformLocation(prog, 'FrameCount');
    for (const [name, param] of Object.entries(shaderKnobs[shaderConfig.active]))
      param.initValue(name);

    let nframe = 0;
    requestAnimationFrame(function drive() {
      if (programChanged) return;
      gl.useProgram(prog);
      oes.bindVertexArrayOES(vao);
      //gl.uniform1f(u_time, performance.now() / 1000); // Time in seconds
      gl.uniform1i(u_framecount, nframe++);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      oes.bindVertexArrayOES(null);

      requestAnimationFrame(drive);
    });
  }

  /**
   * The boilerplate for most shaders. It performs the following important tasks:
   * 1. Setting up the MVP (model view projection) matrix, necessary for correctly displaying the canvas texture.
   * 2. Setting up the VAO (vertex array object) so that it can be reused when drawing the triangles.
   */
  function setupConstantUniforms(prog) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);

    // screen-size quad, triangle strip
    const vertices = new Float32Array([
      -1.0, 1.0,
      -1.0, -1.0,
      1.0, 1.0,
      1.0, -1.0
    ]);

    const vao = oes.createVertexArrayOES();
    oes.bindVertexArrayOES(vao);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const a_position = gl.getAttribLocation(prog, 'a_position');
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(a_position);

    oes.bindVertexArrayOES(null);
    gl.deleteBuffer(vertexBuffer);

    const u_texture = gl.getUniformLocation(prog, 'u_texture');
    gl.uniform1i(u_texture, 0); // Assuming texture unit 0

    const rot180 = [
      -1, 0, 0, 0,
      0, -1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    const yflip = [
      -1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, 0,
      0, 0, 0, 1,
    ];
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'MVP'), false, new Float32Array(matmult(rot180, yflip)));
    return vao;
  }

  if (shaderConfig.active) {
    showToastMessage?.('If the game is not displaying correctly, change Settings (F1) > Video > Scaling method to be not Bilinear.', 'important', true);
    applyShader();
  }

  if (!document.getElementById('shaderModal')) {
    // setup UI
    const openShaderModalButton = document.createElement('button');
    openShaderModalButton.type = 'button';
    openShaderModalButton.innerText = 'Shaders';
    openShaderModalButton.classList.add('unselectable');
    document.getElementById('settingsModal').querySelector('.buttonRow').appendChild(openShaderModalButton);
    openShaderModalButton.onclick = () => {
      document.getElementById('shaderOptions').value = shaderConfig.active;
      document.getElementById('resetShaderButton')?.parentElement.classList.toggle('hidden', !shaderConfig.active);
      initShaderControls();
      openModal('shaderModal', null, 'settingsModal');
    };

    const shaderModal = document.createElement('div');
    shaderModal.id = 'shaderModal';
    shaderModal.classList.add('modal', 'hidden');
    shaderModal.style.opacity = '0.5';

    const shaderChoices = Object.keys(shaderPrograms);
    shaderModal.insertAdjacentHTML('afterbegin', `
      <div class="modalHeader">
        <h1 class="modalTitle">Shaders</h1>
      </div>
      <div class="modalContent">
        <ul class="formControls" style="width:100%">
          <li class="formControlRow">
            <label for="shaderEnableButton" class="unselectable">Enable Shaders</label>
            <div>
              <select id="shaderOptions" size="${Math.min(shaderChoices.length + 1, 5)}">
                <option value="">(None)</option>
                ${shaderChoices.map(key => `
                  <option value="${key}">${key}</option>
                `).join('')}
              </select>
            </div>
          </li>
        </ul>
      </div>
      <div class="modalFooter" class="hidden">
        <button id="resetShaderButton" class="unselectable" type="button">Reset</button>
      </div>`);
    const shaderOptions = shaderModal.querySelector('#shaderOptions');
    const modalFooter = shaderModal.querySelector('.modalFooter');
    shaderOptions.onchange = function() {
      shaderConfig.active = this.value;
      modalFooter.classList.toggle('hidden', !shaderConfig.active);
      updateConfig(shaderConfig, true, 'shader');
      applyShader();

      initShaderControls();
    };

    document.getElementById('settingsModal').insertAdjacentElement('afterend', shaderModal);
    shaderModal.querySelector('#resetShaderButton').onclick = function() {
      if (!shaderConfig.active) return;
      for (const [name, param] of Object.entries(shaderKnobs[shaderConfig.active]))
        param.initValue(name, true);
      updateConfig(shaderConfig, true, 'shader');
    };
    function initShaderControls() {
      const $formControls = shaderModal.querySelector('.formControls');
      for (const input of $formControls.querySelectorAll('.js_shader'))
        input.remove();
      if (!shaderConfig.active)
        return;
      for (const [name, param] of Object.entries(shaderKnobs[shaderConfig.active])) {
        const row = param.init($formControls, name, shaderPrograms[shaderConfig.active], shaderConfig.active);
        row.classList.add('js_shader');
      }
    }
  }
})();
