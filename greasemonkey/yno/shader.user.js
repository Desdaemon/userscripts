// ==UserScript==
// @name         YNO Shaders
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Basic WebGL shaders for YNO
// @author       Desdaemon
// @match        https://ynoproject.net/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ynoproject.net
// @license      MIT
// @supportURL   https://github.com/Desdaemon/userscripts
// @downloadURL  https://raw.githubusercontent.com/Desdaemon/userscripts/refs/heads/main/greasemonkey/yno/shader.user.js
// @updateURL    https://raw.githubusercontent.com/Desdaemon/userscripts/refs/heads/main/greasemonkey/yno/shader.user.js
// @resource     guestLUT https://github.com/libretro/slang-shaders/blob/master/crt/shaders/guest/advanced/lut/ntsc-lut.png?raw=true
// @resource     hyllianLUT https://github.com/libretro/slang-shaders/blob/master/crt/shaders/hyllian/support/LUT/some-grade.png?raw=true
// @grant        GM_getResourceURL
// ==/UserScript==

async function awaitInit() {
  while (!unsafeWindow.loadOrInitConfig)
    await new Promise(resolve => setTimeout(resolve, 3000));
}

(function runShaders(initDone) {
  'use strict';
  if (!initDone)
    return awaitInit().then(() => runShaders(true));
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
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
    gl.deleteShader(vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.deleteShader(fragmentShader);
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
varying vec2 vTexCoord;
uniform mat4 MVP;

void main() {
  gl_Position = MVP * a_position;
  vTexCoord = (a_position.xy + 1.0) * 0.5;
}`;

  // Add new programs here, then for any configurable uniforms add them to shaderKnobs down below.

  const programs = {
    /** @type {{name: string, passes: WebGLProgram[], deinit?(): void, step?(prog: WebGLProgram, idx: number): void} | undefined} */
    __cache: undefined,
    get ['']() {
      if (this.__cache?.name === '')
        return this.__cache;
      this.deinit();

      const passthrough = createProgram(noopVertexSource, `
precision mediump float;
uniform sampler2D Source;
varying vec2 vTexCoord;

void main() {
  gl_FragColor = texture2D(Source, vTexCoord);
}`);

      return this.__cache = {
        name: '',
        passes: [passthrough],
      };
    },
    get crt() {
      if (this.__cache?.name === 'crt')
        return this.__cache;

      const srgb = gl.getExtension('EXT_sRGB');
      if (!srgb) throw new Error('crt needs EXT_sRGB');
      this.deinit();

      /*
          Hyllian's CRT Shader

          Copyright (C) 2011-2024 Hyllian - sergiogdb@gmail.com

          Permission is hereby granted, free of charge, to any person obtaining a copy
          of this software and associated documentation files (the "Software"), to deal
          in the Software without restriction, including without limitation the rights
          to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
          copies of the Software, and to permit persons to whom the Software is
          furnished to do so, subject to the following conditions:

          The above copyright notice and this permission notice shall be included in
          all copies or substantial portions of the Software.

          THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
          AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
          LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
          OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
          THE SOFTWARE.

          Below is a modified version of the crt-hyllian-rgb-slotmask preset,
          shader files can be found at https://github.com/libretro/slang-shaders/tree/master/crt/shaders/hyllian
      */

      const sharedVertexSource = `
attribute vec4 a_position;
varying vec2 vTexCoord;
uniform mat4 MVP;

void main() {
  gl_Position = MVP * a_position;
  vTexCoord = (a_position.xy * 1.0001 + 1.0) * 0.5;
}`;
      const pass0 = createProgram(sharedVertexSource, `
precision mediump float;

varying vec2 vTexCoord;
uniform sampler2D Source;
uniform sampler2D SamplerLUT1;
uniform vec2 SamplerLUT1Size;
uniform sampler2D SamplerLUT2;
uniform vec2 SamplerLUT2Size;

uniform float LUT_selector_param;

// This shouldn't be necessary but it seems some undefined values can
// creep in and each GPU vendor handles that differently. This keeps
// all values within a safe range
vec4 mixfix(vec4 a, vec4 b, float c)
{
	return (a.z < 1.0) ? mix(a, b, c) : a;
}

void main()
{
	vec4 imgColor = texture2D(Source, vTexCoord.xy);

	if (LUT_selector_param == 0.0) {
		gl_FragColor = imgColor;
	}
	else {

	float LUT_Size = mix(SamplerLUT1Size.y, SamplerLUT2Size.y, LUT_selector_param - 1.0);
	vec4 color1, color2 = vec4(0.,0.,0.,0.);
	float red, green, blue1, blue2, mixer = 0.0;

	red = ( imgColor.r * (LUT_Size - 1.0) + 0.4999 ) / (LUT_Size * LUT_Size);
	green = ( imgColor.g * (LUT_Size - 1.0) + 0.4999 ) / LUT_Size;
	blue1 = (floor( imgColor.b  * (LUT_Size - 1.0) ) / LUT_Size) + red;
	blue2 = (ceil( imgColor.b  * (LUT_Size - 1.0) ) / LUT_Size) + red;
	mixer = clamp(max((imgColor.b - blue1) / (blue2 - blue1), 0.0), 0.0, 32.0);

	if(LUT_selector_param == 1.)
	{
   	color1 = texture2D( SamplerLUT1, vec2( blue1, green ));
   	color2 = texture2D( SamplerLUT1, vec2( blue2, green ));
	}
	else
	{
		color1 = texture2D( SamplerLUT2, vec2( blue1, green ));
		color2 = texture2D( SamplerLUT2, vec2( blue2, green ));
	}
	gl_FragColor = mixfix(color1, color2, mixer);
	}
}`);
      const pass1 = createProgram(sharedVertexSource, `
precision mediump float;

uniform float HFILTER_PROFILE;
uniform float SHARPNESS_HACK;
uniform float CRT_ANTI_RINGING;
uniform float CRT_InputGamma;
uniform float CURVATURE;
uniform float WARP_X;
uniform float WARP_Y;

uniform vec2 SourceSize;

#define GAMMA_IN(color)    vec4(pow(color, vec3(CRT_InputGamma, CRT_InputGamma, CRT_InputGamma)), 1.)

/* Curvature code. Credits to torridgristle! */
#define CRT_Distortion (vec2(WARP_X, 0.) * 15.)

#define SQRT_OF_2  1.4142135623730950488016887242097

// Radius of Convergence = 1.0 - SQRT_OF_2 / 2

#define CONVERGENCE_RADIUS 0.29289321881345247559915563789515

vec2 Warp(vec2 texCoord)
{
   vec2 cCoords = texCoord * 2.0 - 1.0;
   float cCoordsDist = sqrt(cCoords.x * cCoords.x + cCoords.y * cCoords.y);
   cCoords = cCoords / cCoordsDist;
   cCoords = cCoords * (1.0 - pow(vec2(1.0 - (cCoordsDist/SQRT_OF_2)),(1.0/(1.0+CRT_Distortion*0.2))));
   cCoords = cCoords / (1.0-pow(vec2(CONVERGENCE_RADIUS),(1.0/(vec2(1.0)+CRT_Distortion*0.2))));
   cCoords = cCoords * 0.5 + 0.5;

   return cCoords;
}

// Horizontal cubic filter.
// Some known filters use these values:

//    B = 0.5, C = 0.0        =>  A sharp almost gaussian filter.
//    B = 0.0, C = 0.0        =>  Hermite cubic filter.
//    B = 1.0, C = 0.0        =>  Cubic B-Spline filter.
//    B = 0.0, C = 0.5        =>  Catmull-Rom Spline filter.
//    B = C = 1.0/3.0         =>  Mitchell-Netravali cubic filter.
//    B = 0.3782, C = 0.3109  =>  Robidoux filter.
//    B = 0.2620, C = 0.3690  =>  Robidoux Sharp filter.

// For more info, see: http://www.imagemagick.org/Usage/img_diagrams/cubic_survey.gif

mat4 get_hfilter_profile()
{
    float bf = 0.0;
    float cf = 0.0;

    if (HFILTER_PROFILE > 0.5) {bf = 0.0; cf = 0.5;}

    return mat4( (          -bf - 6.0*cf)/6.0,         (3.0*bf + 12.0*cf)/6.0, (-3.0*bf - 6.0*cf)/6.0,             bf/6.0,
                 (12.0 - 9.0*bf - 6.0*cf)/6.0, (-18.0 + 12.0*bf + 6.0*cf)/6.0,                    0.0, (6.0 - 2.0*bf)/6.0,
                -(12.0 - 9.0*bf - 6.0*cf)/6.0, (18.0 - 15.0*bf - 12.0*cf)/6.0,  (3.0*bf + 6.0*cf)/6.0,             bf/6.0,
                 (           bf + 6.0*cf)/6.0,                            -cf,                    0.0,                0.0);
}

varying vec2 vTexCoord;
uniform sampler2D Source;
#define texture texture2D

void main()
{
    vec2 texture_size = vec2(SHARPNESS_HACK*SourceSize.x, SourceSize.y);

    vec2 dx = vec2(1.0/texture_size.x, 0.0);

    vec2 WarpedTexCoord = vTexCoord.xy;

    WarpedTexCoord = (CURVATURE > 0.5) ? Warp(WarpedTexCoord) : WarpedTexCoord;

    vec2 pix_coord = WarpedTexCoord.xy*texture_size + vec2(-0.5, 0.0);

    vec2 tc = (floor(pix_coord) + vec2(0.5,0.5))/texture_size;

    vec2 fp = fract(pix_coord);

    vec4 c10 = GAMMA_IN(texture(Source, tc     - dx).xyz);
    vec4 c11 = GAMMA_IN(texture(Source, tc         ).xyz);
    vec4 c12 = GAMMA_IN(texture(Source, tc     + dx).xyz);
    vec4 c13 = GAMMA_IN(texture(Source, tc + 2.0*dx).xyz);

    mat4 color_matrix = mat4(c10, c11, c12, c13);

    mat4 invX    = get_hfilter_profile();
    vec4 lobes   = vec4(fp.x*fp.x*fp.x, fp.x*fp.x, fp.x, 1.0);
    vec4 invX_Px = lobes * invX;
    vec3 color   = (color_matrix * invX_Px).xyz;

    // Anti-ringing
    //  Get min/max samples
    vec3 min_sample = min(c11,c12).xyz;
    vec3 max_sample = max(c11,c12).xyz;

    vec3 aux = color;
    color = clamp(color, min_sample, max_sample);
    color = mix(aux, color, CRT_ANTI_RINGING);

    gl_FragColor = vec4(color, 1.0);
}`);

      const pass2 = createProgram(sharedVertexSource, `
precision mediump float;

uniform vec2 SourceSize;
uniform vec4 OriginalSize;
uniform vec2 OutputSize;

uniform float CRT_OutputGamma;
uniform float PHOSPHOR_LAYOUT;
uniform float MASK_INTENSITY;
uniform float MONITOR_SUBPIXELS;
uniform float BRIGHTBOOST;
uniform float SCANLINES_SHAPE;
uniform float SCANLINES_STRENGTH;
uniform float BEAM_MIN_WIDTH;
uniform float BEAM_MAX_WIDTH;
uniform float POST_BRIGHTNESS;
uniform float CURVATURE;
uniform float WARP_X;
uniform float WARP_Y;
uniform float CORNER_SIZE;
uniform float CORNER_SMOOTHNESS;

#define BRIGHTBOOST_p (BRIGHTBOOST+1.1)
#define SCANLINES_STRENGTH_p (-0.16*SCANLINES_SHAPE+SCANLINES_STRENGTH)
#define CORNER_SMOOTHNESS_p (80.0*pow(CORNER_SMOOTHNESS,10.0))

#define GAMMA_OUT(color)   pow(color, vec3(1.0 / CRT_OutputGamma, 1.0 / CRT_OutputGamma, 1.0 / CRT_OutputGamma))

varying vec2 vTexCoord;
uniform sampler2D Source;

#define corner_aspect vec2(1., 0.75)
#define texture texture2D

float corner(vec2 coord)
{
    coord = (coord - vec2(0.5)) + vec2(0.5, 0.5);
    coord = min(coord, vec2(1.0) - coord) * corner_aspect;
    vec2 cdist = vec2(CORNER_SIZE);
    coord = (cdist - min(coord, cdist));
    float dist = sqrt(dot(coord, coord));

    return clamp((cdist.x - dist)*CORNER_SMOOTHNESS_p, 0.0, 1.0);
}

/* Curvature code. Credits to torridgristle! */
#define CRT_Distortion (vec2(0.0, WARP_Y) * 15.)

#define SQRT_OF_2  1.4142135623730950488016887242097

// Radius of Convergence = 1.0 - SQRT_OF_2 / 2

#define CONVERGENCE_RADIUS 0.29289321881345247559915563789515

vec2 Warp(vec2 texCoord)
{
   vec2 cCoords = texCoord * 2.0 - 1.0;
   float cCoordsDist = sqrt(cCoords.x * cCoords.x + cCoords.y * cCoords.y);
   cCoords = cCoords / cCoordsDist;
   cCoords = cCoords * (1.0 - pow(vec2(1.0 - (cCoordsDist/SQRT_OF_2)),(1.0/(1.0+CRT_Distortion*0.2))));
   cCoords = cCoords / (1.0-pow(vec2(CONVERGENCE_RADIUS),(1.0/(vec2(1.0)+CRT_Distortion*0.2))));
   cCoords = cCoords * 0.5 + 0.5;

   return cCoords;
}

int imod(int a, int b) {
  return int(floor(mod(float(a), float(b))));
}

int iabs(int value) {
  return value < 0 ? -value : value;
}

/* Mask code pasted from subpixel_masks.h. Masks 3 and 4 added. */
vec3 mask_weights(vec2 coord, float mask_intensity, int phosphor_layout, float monitor_subpixels){
   vec3 weights = vec3(1.,1.,1.);
   float on = 1.;
   float off = 1.-mask_intensity;
   vec3 red     = monitor_subpixels==1.0 ? vec3(on,  off, off) : vec3(off, off, on );
   vec3 green   = vec3(off, on,  off);
   vec3 blue    = monitor_subpixels==1.0 ? vec3(off, off, on ) : vec3(on,  off, off);
   vec3 magenta = vec3(on,  off, on );
   vec3 yellow  = monitor_subpixels==1.0 ? vec3(on,  on,  off) : vec3(off, on,  on );
   vec3 cyan    = monitor_subpixels==1.0 ? vec3(off, on,  on ) : vec3(on,  on,  off);
   vec3 black   = vec3(off, off, off);
   vec3 white   = vec3(on,  on,  on );
   int w, z = 0;

   // This pattern is used by a few layouts, so we'll define it here
   vec3 aperture_weights = mix(magenta, green, floor(mod(coord.x, 2.0)));

   if(phosphor_layout == 0) return weights;

   else if(phosphor_layout == 1){
      // classic aperture for RGB panels; good for 1080p, too small for 4K+
      // aka aperture_1_2_bgr
      weights  = aperture_weights;
      return weights;
   }

   else if(phosphor_layout == 2){
      // Classic RGB layout; good for 1080p and lower
      // vec3 bw3[3] = vec3[3](red, green, blue);
//      vec3 bw3[3] = vec3[](black, yellow, blue);

      z = int(floor(mod(coord.x, 3.0)));

      // weights = bw3[z];
      // return weights;
      if (z == 0) return red;
      else if (z == 1) return green;
      else return blue;
   }

   else if(phosphor_layout == 3){
      // black and white aperture; good for weird subpixel layouts and low brightness; good for 1080p and lower
      // vec3 bw3[3];
      // bw3[0] = black;
      // bw3[1] = white;
      // bw3[2] = black;

      z = int(floor(mod(coord.x, 3.0)));

      // weights = bw3[z];
      // return weights;
      return z == 1 ? white : black;
   }

   else if(phosphor_layout == 4){
      // reduced TVL aperture for RGB panels. Good for 4k.
      // aperture_2_4_rgb

      w = int(floor(mod(coord.x, 4.0)));

      // weights = big_ap_rgb[w];
      // return weights;
      if (z == 0) return red;
      else if (z == 1) return yellow;
      else if (z == 2) return cyan;
      else return blue;
   }

   else if(phosphor_layout == 5){
      // black and white aperture; good for weird subpixel layouts and low brightness; good for 4k
      // vec3 bw4[4] = vec3[4](black, black, white, white);

      z = int(floor(mod(coord.x, 4.0)));

      // weights = bw4[z];
      return z > 1 ? white : black;
   }

   else if(phosphor_layout == 6){
      // aperture_1_4_rgb; good for simulating lower

      z = int(floor(mod(coord.x, 4.0)));

      if (z == 0) return red;
      else if (z == 1) return green;
      else if (z == 2) return blue;
      else return black;
   }

   else if(phosphor_layout == 7){
      // 2x2 shadow mask for RGB panels; good for 1080p, too small for 4K+
      // aka delta_1_2x1_bgr
      vec3 inverse_aperture = mix(green, magenta, floor(mod(coord.x, 2.0)));
      weights               = mix(aperture_weights, inverse_aperture, floor(mod(coord.y, 2.0)));
      return weights;
   }

   else if(phosphor_layout == 8){
      // delta_2_4x1_rgb
      // vec3 delta[8];
      // delta[0] = red;
      // delta[1] = yellow;
      // delta[2] = cyan;
      // delta[3] = blue;
      // delta[4] = cyan;
      // delta[5] = blue;
      // delta[6] = red;
      // delta[7] = yellow;

      w = int(floor(mod(coord.y, 2.0)));
      z = int(floor(mod(coord.x, 4.0)));
      int f = w * 4 + z;

      if (f > 1 && f < 6)
        return imod(f, 2) == 0 ? cyan : blue;
      else
        return imod(f, 2) == 0 ? red : yellow;
   }

   else if(phosphor_layout == 9){
      // delta_1_4x1_rgb; dunno why this is called 4x1 when it's obviously 4x2 /shrug
      // vec3 delta1[2][4] = vec3[][](
      //    vec3[](red,  green, blue, black),
      //    vec3[](blue, black, red,  green)
      // );

      w = int(floor(mod(coord.y, 2.0)));
      z = int(floor(mod(coord.x, 4.0)));
      int f = w * 4 + z;

      if (f > 1 && f < 6)
        return imod(f, 2) == 0 ? blue : black;
      else
        return imod(f, 2) == 0 ? red : green;
   }

   else if(phosphor_layout == 10){
      // delta_2_4x2_rgb
      // vec3 delta[4][4] = vec3[][](
      //    vec3[](red,  yellow, cyan, blue),
      //    vec3[](red,  yellow, cyan, blue),
      //    vec3[](cyan, blue,   red,  yellow),
      //    vec3[](cyan, blue,   red,  yellow)
      // );

      w = int(floor(mod(coord.y, 4.0)));
      z = int(floor(mod(coord.x, 4.0)));

      if (iabs(w-z) < 2) {
        if (z == w) return yellow;
        else return z > w ? yellow : red;
      } else {
        if (z == w) return blue;
        else return z > w ? blue : cyan;
      }
   }

   else if(phosphor_layout == 11){
      // slot mask for RGB panels; looks okay at 1080p, looks better at 4K
      // vec3 slotmask[4][6] = vec3[][](
      //    vec3[](red, green, blue,    red, green, blue),
      //    vec3[](red, green, blue,  black, black, black),
      //    vec3[](red, green, blue,    red, green, blue),
      //    vec3[](black, black, black, red, green, blue)
      // );

      w = int(floor(mod(coord.y, 4.0)));
      z = int(floor(mod(coord.x, 6.0)));

      if (w == 1 && z >= 3) return black;
      if (w == 3 && z <= 2) return black;

      int f = imod(z, 3);
      if (f == 0) return red;
      else if (f == 1) return green;
      else return blue;
   }

   else if(phosphor_layout == 12){
      // slot mask for RGB panels; looks okay at 1080p, looks better at 4K
      // vec3 slotmask[4][6] = vec3[][](
      //    vec3[](black,  white, black,   black,  white, black),
      //    vec3[](black,  white, black,  black, black, black),
      //    vec3[](black,  white, black,  black,  white, black),
      //    vec3[](black, black, black,  black,  white, black)
      // );

      w = int(floor(mod(coord.y, 4.0)));
      z = int(floor(mod(coord.x, 6.0)));

      if (w == 1 && z >= 3) return black;
      if (w == 3 && z <= 2) return black;

      int f = imod(z, 3);
      return f == 1 ? white : black;
   }

   else if(phosphor_layout == 13){
      // based on MajorPainInTheCactus' HDR slot mask
      // vec3 slot[4][8] = vec3[][](
      //    vec3[](red,   green, blue,  black, red,   green, blue,  black),
      //    vec3[](red,   green, blue,  black, black, black, black, black),
      //    vec3[](red,   green, blue,  black, red,   green, blue,  black),
      //    vec3[](black, black, black, black, red,   green, blue,  black)
      // );

      w = int(floor(mod(coord.y, 4.0)));
      z = int(floor(mod(coord.x, 8.0)));

      // weights = slot[w * 8 + z];
      // return weights;
      if (w == 1 && z >= 4) return black;
      if (w == 3 && z <= 3) return black;

      int f = imod(z, 4);
      if (f == 0) return red;
      else if (f == 1) return green;
      else if (f == 2) return blue;
      else return black;
   }

   else if(phosphor_layout == 14){
      // same as above but for RGB panels
      // vec3 slot2[4][10] = vec3[][](
      //    vec3[](red,   yellow, green, blue,  blue,  red,   yellow, green, blue,  blue ),
      //    vec3[](black, green,  green, blue,  blue,  red,   red,    black, black, black),
      //    vec3[](red,   yellow, green, blue,  blue,  red,   yellow, green, blue,  blue ),
      //    vec3[](red,   red,    black, black, black, black, green,  green, blue,  blue)
      // );

      // w = int(floor(mod(coord.y, 4.0)));
      // z = int(floor(mod(coord.x, 10.0)));

      // weights = slot2[w * 10 + z];
      // return weights;
      // TODO
      return weights;
   }

   else if(phosphor_layout == 15){
      // slot_3_7x6_rgb
      // vec3 slot[6][14] = vec3[][](
      //    vec3[](red,   red,   yellow, green, cyan,  blue,  blue,  red,   red,   yellow, green,  cyan,  blue,  blue),
      //    vec3[](red,   red,   yellow, green, cyan,  blue,  blue,  red,   red,   yellow, green,  cyan,  blue,  blue),
      //    vec3[](red,   red,   yellow, green, cyan,  blue,  blue,  black, black, black,  black,  black, black, black),
      //    vec3[](red,   red,   yellow, green, cyan,  blue,  blue,  red,   red,   yellow, green,  cyan,  blue,  blue),
      //    vec3[](red,   red,   yellow, green, cyan,  blue,  blue,  red,   red,   yellow, green,  cyan,  blue,  blue),
      //    vec3[](black, black, black,  black, black, black, black, black, red,   red,    yellow, green, cyan,  blue)
      // );
      // vec3 slot[84];

      w = int(floor(mod(coord.y, 6.0)));
      z = int(floor(mod(coord.x, 14.0)));
      if (w == 2 && z >= 7) return black;
      if (w == 5 && z <= 6) return black;

      int f = imod(z, 4);
      if (f == 0) return red;
      else if (f == 1) return green;
      else if (f == 2) return blue;
      else return black;

   }

   else return weights;
}

#define pi    3.1415926535897932384626433832795
#define wa    (0.5*pi)
#define wb    (pi)

vec3 resampler3(vec3 x)
{
    vec3 res;

    res.x = (x.x<=0.001) ?  1.0  :  sin(x.x*wa)*sin(x.x*wb)/(wa*wb*x.x*x.x);
    res.y = (x.y<=0.001) ?  1.0  :  sin(x.y*wa)*sin(x.y*wb)/(wa*wb*x.y*x.y);
    res.z = (x.z<=0.001) ?  1.0  :  sin(x.z*wa)*sin(x.z*wb)/(wa*wb*x.z*x.z);

    return res;
}

vec3 get_scanlines(vec3 d0, vec3 d1, vec3 color0, vec3 color1)
{
    if (SCANLINES_SHAPE > 0.5) {
        d0 = exp(-16.0*d0*d0);
        d1 = exp(-16.0*d1*d1);
    }
    else {
        d0 = clamp(2.0*d0, 0.0, 1.0);
        d1 = clamp(2.0*d1, 0.0, 1.0);
        d0 = resampler3(d0);
        d1 = resampler3(d1);
    }

    return (color0*d0+color1*d1);
}

void main()
{
    vec2 texture_size = SourceSize.xy;

    vec3 color;
    vec2 dy = vec2(0.0, 1.0/texture_size.y);

    vec2 WarpedTexCoord = vTexCoord.xy;

    WarpedTexCoord = (CURVATURE > 0.5) ? Warp(WarpedTexCoord) : WarpedTexCoord;

    vec2 pix_coord = WarpedTexCoord.xy*texture_size + vec2(0.0, -0.5);

    vec2 tc = (floor(pix_coord)+vec2(0.5,0.5))/texture_size;

    vec2 fp = fract(pix_coord);

    vec3 color0 = texture(Source, tc     ).xyz;
    vec3 color1 = texture(Source, tc + dy).xyz;

    float pos0 = fp.y;
    float pos1 = 1. - fp.y;

    vec3 lum0 = mix(vec3(BEAM_MIN_WIDTH), vec3(BEAM_MAX_WIDTH), color0);
    vec3 lum1 = mix(vec3(BEAM_MIN_WIDTH), vec3(BEAM_MAX_WIDTH), color1);

    vec3 d0 = SCANLINES_STRENGTH_p*pos0/(lum0*lum0+0.0000001);
    vec3 d1 = SCANLINES_STRENGTH_p*pos1/(lum1*lum1+0.0000001);

    color  = BRIGHTBOOST_p*get_scanlines(d0, d1, color0, color1);

    color  = GAMMA_OUT(color);

    vec2 mask_coords =vTexCoord.xy * OutputSize.xy;

    color.rgb*=GAMMA_OUT(mask_weights(mask_coords, MASK_INTENSITY, int(PHOSPHOR_LAYOUT), MONITOR_SUBPIXELS));

    gl_FragColor = vec4(POST_BRIGHTNESS*color, 1.0);

    gl_FragColor *= (CURVATURE > 0.5) ? corner(WarpedTexCoord) : 1.0;
}`);

      function loadTexture(url) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);

        // Because images have to be downloaded over the internet
        // they might take a moment until they are ready.
        // Until then put a single pixel in the texture so we can
        // use it immediately. When the image has finished downloading
        // we'll update the texture with the contents of the image.
        const level = 0;
        const internalFormat = gl.RGBA;
        const width = 1;
        const height = 1;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
        gl.texImage2D(
          gl.TEXTURE_2D,
          level,
          internalFormat,
          width,
          height,
          border,
          srcFormat,
          srcType,
          pixel,
        );

        const image = new Image();
        image.onload = () => {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(
            gl.TEXTURE_2D,
            level,
            internalFormat,
            srcFormat,
            srcType,
            image,
          );

          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        };
        image.src = url;

        return { texture, image };
      }
      const samplerLUT1 = loadTexture(GM_getResourceURL('guestLUT'));
      const samplerLUT2 = loadTexture(GM_getResourceURL('hyllianLUT'));


      function createFramebuffer(width, height) {
        const format = srgb.SRGB_ALPHA_EXT;
        const fbtex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, fbtex);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, width, height, 0, format, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbtex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return { fb, fbtex, width, height };
      }

      const { fb: fb1, fbtex: fbtex1, ...fb1dim } = createFramebuffer(gl.drawingBufferWidth, gl.drawingBufferHeight);
      const { fb: fb2, fbtex: fbtex2, ...fb2dim } = createFramebuffer(gl.drawingBufferWidth, gl.drawingBufferHeight);

      return this.__cache = {
        name: 'crt',
        passes: [pass0, pass1, pass2],
        deinit() {
          gl.deleteTexture(samplerLUT1.texture);
          gl.deleteTexture(samplerLUT2.texture);
          gl.deleteFramebuffer(fb1);
          gl.deleteTexture(fbtex1);
          gl.deleteFramebuffer(fb2);
          gl.deleteTexture(fbtex2);
        },
        step(pass, idx) {
          switch (idx) {
            case 0:
              gl.bindFramebuffer(gl.FRAMEBUFFER, fb1);
              gl.viewport(0, 0, fb1dim.width, fb1dim.height);

              applyUniforms(pass, 'crt', 'LUT_selector_param');
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, samplerLUT1.texture);
              gl.uniform1i(gl.getUniformLocation(pass, 'SamplerLUT1'), 2);
              gl.uniform2f(gl.getUniformLocation(pass, 'SamplerLUT1Size'), samplerLUT1.image.width, samplerLUT1.image.height);
              gl.activeTexture(gl.TEXTURE3);
              gl.bindTexture(gl.TEXTURE_2D, samplerLUT2.texture);
              gl.uniform1i(gl.getUniformLocation(pass, 'SamplerLUT2'), 3);
              gl.uniform2f(gl.getUniformLocation(pass, 'SamplerLUT2Size'), samplerLUT2.image.width, samplerLUT2.image.height);
              gl.activeTexture(gl.TEXTURE0);
              break;
            case 1:
              gl.bindFramebuffer(gl.FRAMEBUFFER, fb2);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, fbtex1);
              gl.viewport(0, 0, fb2dim.width, fb2dim.height);

              gl.uniform2f(gl.getUniformLocation(pass, 'SourceSize'), fb1dim.width, fb1dim.height);
              applyUniforms(pass, 'crt',
                'HFILTER_PROFILE', 'CRT_ANTI_RINGING', 'SHARPNESS_HACK',
                'CRT_InputGamma', 'CURVATURE', 'WARP_X', 'WARP_Y');
              break;
            case 2:
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, fbtex2);
              gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

              gl.uniform2f(gl.getUniformLocation(pass, 'SourceSize'), fb2dim.width, fb2dim.height);
              gl.uniform2f(gl.getUniformLocation(pass, 'OutputSize'), gl.drawingBufferWidth, gl.drawingBufferHeight);
              applyUniforms(pass, 'crt',
                'CRT_OutputGamma', 'PHOSPHOR_LAYOUT', 'MASK_INTENSITY', 'MONITOR_SUBPIXELS',
                'BRIGHTBOOST', 'BEAM_MIN_WIDTH', 'BEAM_MAX_WIDTH', 'SCANLINES_STRENGTH',
                'SCANLINES_SHAPE', 'POST_BRIGHTNESS', 'CURVATURE', 'WARP_X', 'WARP_Y',
                'CORNER_SIZE', 'CORNER_SMOOTHNESS');
              break;
          }
        }
      };
    },
    get ntsc() {
      if (this.__cache?.name === 'ntsc')
        return this.__cache;
      this.deinit();

      const ext = gl.getExtension('OES_texture_half_float');
      if (!ext) throw new Error('NTSC filter requires OES_texture_half_float');

      const ntscRgbyuv = `
const mat3 yiq2rgb_mat = mat3(
   1.0, 0.956, 0.6210,
   1.0, -0.2720, -0.6474,
   1.0, -1.1060, 1.7046);

vec3 yiq2rgb(vec3 yiq)
{
   return yiq * yiq2rgb_mat;
}

const mat3 yiq_mat = mat3(
    0.2989, 0.5870, 0.1140,
    0.5959, -0.2744, -0.3216,
    0.2115, -0.5229, 0.3114
);

vec3 rgb2yiq(vec3 col)
{
   return col * yiq_mat;
}`;

      const pass1 = createProgram(`
precision mediump float;

attribute vec4 a_position;
#define Position a_position
varying vec2 vTexCoord;
uniform mat4 MVP;

uniform vec2 SourceSize;
uniform vec2 OutputSize;
varying vec2 pix_no;

void main()
{
   gl_Position = MVP * Position;
   vec2 TexCoord = (a_position.xy + 1.0) * 0.5;
   vTexCoord = TexCoord;
   pix_no = TexCoord * SourceSize.xy * (OutputSize.xy / SourceSize.xy);
}
`, `
precision mediump float;

#define TWO_PHASE
#define SVIDEO

#define PI 3.14159265

#if defined(TWO_PHASE)
#define CHROMA_MOD_FREQ (4.0 * PI / 15.0)
#elif defined(THREE_PHASE)
#define CHROMA_MOD_FREQ (PI / 3.0)
#endif

#if defined(COMPOSITE)
#define SATURATION 1.0
#define BRIGHTNESS 1.0
#define ARTIFACTING 1.0
#define FRINGING 1.0
#elif defined(SVIDEO)
#define SATURATION 1.0
#define BRIGHTNESS 1.0
#define ARTIFACTING 0.0
#define FRINGING 0.0
#endif

#if defined(COMPOSITE) || defined(SVIDEO)
const mat3 mix_mat = mat3(
	BRIGHTNESS, FRINGING, FRINGING,
	ARTIFACTING, 2.0 * SATURATION, 0.0,
	ARTIFACTING, 0.0, 2.0 * SATURATION
);
#endif

${ntscRgbyuv}

varying vec2 vTexCoord;
varying vec2 pix_no;
uniform sampler2D Source;
uniform float FrameCount;

void main()
{
  vec3 col = texture2D(Source, vTexCoord).rgb;
  vec3 yiq = rgb2yiq(col);

  #if defined(TWO_PHASE)
  float chroma_phase = PI * (mod(pix_no.y, 2.0) + FrameCount);
  #elif defined(THREE_PHASE)
  float chroma_phase = 0.6667 * PI * (mod(pix_no.y, 3.0) + FrameCount);
  #endif

  float mod_phase = chroma_phase + pix_no.x * CHROMA_MOD_FREQ;

  float i_mod = cos(mod_phase);
  float q_mod = sin(mod_phase);

  yiq.yz *= vec2(i_mod, q_mod); // Modulate.
  yiq *= mix_mat; // Cross-talk.
  yiq.yz *= vec2(i_mod, q_mod); // Demodulate.
  gl_FragColor = vec4(yiq, 1.0);
}`);

      const pass2 = createProgram(`
precision mediump float;
attribute vec4 a_position;
#define Position a_position
varying vec2 vTexCoord;
uniform vec2 SourceSize;

uniform mat4 MVP;

void main()
{
   gl_Position = Position;
   vec2 TexCoord = (a_position.xy + 1.0) * 0.5;
   vTexCoord = TexCoord - vec2(0.5 / SourceSize.x, 0.0); // Compensate for decimate-by-2.
}`, `
precision mediump float;

${ntscRgbyuv}

#define TAPS 32
uniform float luma_filter[TAPS+1];
uniform float chroma_filter[TAPS+1];

#define fetch_offset(offset, one_x) \
   texture2D(Source, vTexCoord + vec2((offset) * (one_x), 0.0)).xyz

#define NTSC_CRT_GAMMA 2.5
#define NTSC_MONITOR_GAMMA 2.0   

varying vec2 vTexCoord;
uniform sampler2D Source;

uniform vec2 SourceSize;

void main()
{
   float one_x = 1.0 / SourceSize.x;
  vec3 signal = vec3(0.0);
  for (int i = 0; i < TAPS; i++)
  {
     float offset = float(i);

     vec3 sums = fetch_offset(offset - float(TAPS), one_x) +
        fetch_offset(float(TAPS) - offset, one_x);

     signal += sums * vec3(luma_filter[i], chroma_filter[i], chroma_filter[i]);
  }
  signal += texture2D(Source, vTexCoord).xyz *
     vec3(luma_filter[TAPS], chroma_filter[TAPS], chroma_filter[TAPS]);
  vec3 rgb = yiq2rgb(signal);
  gl_FragColor = vec4(pow(rgb, vec3(NTSC_CRT_GAMMA / NTSC_MONITOR_GAMMA)), 1.0);
}`);

      let nframes = 0;
      const lumaFilter = new Float32Array([-0.000174844, -0.000205844, -0.000149453, -0.000051693, 0.000000000, -0.000066171,
      -0.000245058, -0.000432928, -0.000472644, -0.000252236, 0.000198929, 0.000687058, 0.000944112, 0.000803467,
        0.000363199, 0.000013422, 0.000253402, 0.001339461, 0.002932972, 0.003983485, 0.003026683, -0.001102056,
      -0.008373026, -0.016897700, -0.022914480, -0.021642347, -0.008863273, 0.017271957, 0.054921920, 0.098342579,
        0.139044281, 0.168055832, 0.178571429]);

      const chromaFilter = new Float32Array([0.001384762, 0.001678312, 0.002021715, 0.002420562, 0.002880460, 0.003406879, 0.004004985, 0.004679445,
        0.005434218, 0.006272332, 0.007195654, 0.008204665, 0.009298238, 0.010473450, 0.011725413, 0.013047155,
        0.014429548, 0.015861306, 0.017329037, 0.018817382, 0.020309220, 0.021785952, 0.023227857, 0.024614500,
        0.025925203, 0.027139546, 0.028237893, 0.029201910, 0.030015081, 0.030663170, 0.031134640, 0.031420995, 0.031517031]);

      function createFramebuffer(width, height) {
        const fbtex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, fbtex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, ext.HALF_FLOAT_OES, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbtex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        return { fb, fbtex, width, height };
      }

      const { fb, fbtex, ...fbdim } = createFramebuffer(1280, gl.drawingBufferHeight)

      return this.__cache = {
        name: 'ntsc',
        passes: [pass1, pass2],
        deinit() {
          gl.deleteFramebuffer(fb);
          gl.deleteTexture(fbtex);
        },
        step(pass, idx) {
          if (idx === 0)
            nframes = (nframes + 1) % 2;
          gl.uniform1f(gl.getUniformLocation(pass, 'FrameCount'), nframes);

          switch (idx) {
            case 0:
              gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
              gl.viewport(0, 0, fbdim.width, fbdim.height);

              gl.uniform2f(gl.getUniformLocation(pass, 'SourceSize'), gl.drawingBufferWidth, gl.drawingBufferHeight);
              gl.uniform2f(gl.getUniformLocation(pass, 'OutputSize'), fbdim.width, fbdim.height);
              break;
            case 1:
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, fbtex);
              gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

              gl.uniform2f(gl.getUniformLocation(pass, 'SourceSize'), fbdim.width, fbdim.height);

              gl.uniform1fv(gl.getUniformLocation(pass, 'luma_filter'), lumaFilter);
              gl.uniform1fv(gl.getUniformLocation(pass, 'chroma_filter'), chromaFilter);
              break;
          }
        }
      };
    },
    get sepia() {
      if (this.__cache?.name === 'sepia')
        return this.__cache;
      this.deinit();

      const sepiaPass = createProgram(noopVertexSource, `
precision mediump float;
uniform sampler2D Source;
varying vec2 vTexCoord;

void main() {
  vec4 color = texture2D(Source, vTexCoord);

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
      return this.__cache = {
        name: 'sepia',
        passes: [sepiaPass],
      }
    },
    deinit() {
      if (!this.__cache) return;
      console.warn('deinit', this.__cache.name);
      for (const pass of this.__cache.passes)
        gl.deleteProgram(pass);
      this.__cache.deinit?.();
      this.__cache = undefined;
    }
  }

  /**
    @template {keyof typeof shaderKnobs} T
    @param {T} program
    @param {Array<keyof typeof shaderKnobs[T]>} uniforms
  */
  function applyUniforms(pass, program, ...uniforms) {
    if (!shaderKnobs[program]) return;
    if (!uniforms.length)
      uniforms = Object.keys(shaderKnobs[program]);
    for (const uniform of uniforms)
      shaderKnobs[program][uniform].initValue(uniform, pass);
  }

  /** See {@linkcode shaderKnobs} for example usage. */
  class Param {
    constructor(displayName, defaultValue, min, max, step, onUpdate = gl.uniform1f.bind(gl)) {
      this.displayName = displayName;
      this.defaultValue = defaultValue;
      this.min = min;
      this.max = max;
      this.step = step;
      this.onUpdate = onUpdate;
    }
    initValue(name, pass = undefined, reset = false) {
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
      if (!pass && programs[activeProgram])
        pass = programs[activeProgram].passes[0];
      if (pass)
        this.onUpdate(gl.getUniformLocation(pass, name), value);
    }
    init($parent, name, configNamespace) {
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
        debouncedSaveConfig();
      };

      const row = document.createElement('li');
      row.classList.add('formControlRow');
      row.classList.toggle('indent', (this.displayName || name).startsWith(' '));
      row.insertAdjacentHTML('afterbegin', `<label class="unselectable" for="${name}">${this.displayName || name}</label>`);
      row.appendChild(input)
      $parent.appendChild(row);
      return row;
    }
  }

  class ParamSection extends Param {
    constructor(displayName) {
      super(displayName);
    }
    initValue() { }
    init($parent, name, _program, _ns) {
      const row = document.createElement('li');
      row.classList.add('formControlRow');
      row.insertAdjacentHTML('afterbegin', `<label class="unselectable" for="${name}">${this.displayName || name}</label>`);
      $parent.appendChild(row);
      return row;
    }
  }

  const shaderKnobs = {
    '': {},
    crt: {
      LUT_selector_param: new Param('LUT [ Off | NTSC | Grade ]', 2, 0, 2, 1),
      CRT_HYLLIAN: new ParamSection('[CRT-HYLLIAN PARAMS]'),
      HFILTER_PROFILE: new Param("HORIZONTAL FILTER PROFILE [ SHARP1 | SHARP2 ]", 0, 0.0, 1.0, 1.0),
      CRT_ANTI_RINGING: new Param("ANTI RINGING", 1.0, 0.0, 1.0, 1.0),
      SHARPNESS_HACK: new Param("SHARPNESS_HACK", 1.0, 1.0, 4.0, 1.0),
      CRT_InputGamma: new Param("INPUT GAMMA", 2.4, 1.0, 5.0, 0.1),
      CRT_OutputGamma: new Param("OUTPUT GAMMA", 2.2, 1.0, 5.0, 0.05),
      PHOSPHOR_LAYOUT: new Param("PHOSPHOR LAYOUT [1-6 Aperture, 7-10 Shadow, 11-14 Slot]", 11.0, 0.0, 15.0, 1.0),
      MASK_INTENSITY: new Param("MASK INTENSITY", 0.65, 0.0, 1.0, 0.01),
      MONITOR_SUBPIXELS: new Param("MONITOR SUBPIXELS LAYOUT [0=RGB, 1=BGR]", 0.0, 0.0, 1.0, 1.0),
      BRIGHTBOOST: new Param("BRIGHTNESS BOOST", 1.3, 1.0, 3.0, 0.05),
      BEAM_MIN_WIDTH: new Param("MIN BEAM WIDTH", 0.65, 0.0, 1.0, 0.02),
      BEAM_MAX_WIDTH: new Param("MAX BEAM WIDTH", 1.0, 0.0, 1.0, 0.02),
      SCANLINES_STRENGTH: new Param("SCANLINES STRENGTH", 0.55, 0.0, 1.0, 0.01),
      SCANLINES_SHAPE: new Param("SCANLINES SHAPE (SINC | GAUSSIAN)", 0.0, 0.0, 1.0, 1.0),
      POST_BRIGHTNESS: new Param("POST-BRIGHTNESS", 1.00, 1.0, 3.0, 0.05),
      CURVATURE: new Param("ENABLE CURVATURE", 1, 0.0, 1.0, 1.0),
      WARP_X: new Param(" CURVATURE-X", 0.02, 0.0, 0.125, 0.005),
      WARP_Y: new Param(" CURVATURE-Y", 0.025, 0.0, 0.125, 0.005),
      CORNER_SIZE: new Param(" CORNER SIZE", 0.025, 0.001, 1.0, 0.005),
      CORNER_SMOOTHNESS: new Param(" CORNER SMOOTHNESS", 1.08, 1.0, 2.2, 0.02),
    },
    ntsc: {},
    sepia: {}
  }

  const shaderConfig = {
    /** @type {'crt' | 'sepia' | undefined} */
    active: 'crt',
    params: { "": {}, crt: {}, sepia: {}, ntsc: {} }
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
    const prog = programs[shaderConfig.active] || programs[''];
    let vao;
    for (const pass of prog.passes) {
      vao = setupConstantUniforms(pass, vao);
      gl.uniform2f(gl.getUniformLocation(pass, 'SourceSize'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform2f(gl.getUniformLocation(pass, 'OutputSize'), gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.enableVertexAttribArray(gl.getAttribLocation(pass, 'a_position'));

      // const u_time = gl.getUniformLocation(prog, 'u_time');
      // const u_framecount = gl.getUniformLocation(prog, 'FrameCount');
      for (const [name, param] of Object.entries(shaderKnobs[shaderConfig.active]))
        param.initValue(name, pass);
    }
    // let nframe = 0;
    requestAnimationFrame(function drive() {
      if (programChanged) return programs.deinit();

      // const frameCount = nframe++;
      let passCount = 0;
      for (const pass of prog.passes) {
        gl.useProgram(pass);
        oes.bindVertexArrayOES(vao);
        // gl.uniform1i(gl.getUniformLocation(pass, 'FrameCount'), frameCount);
        prog.step?.(pass, passCount++);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        oes.bindVertexArrayOES(null);
      }

      requestAnimationFrame(drive);
    });
  }

  canvas.addEventListener('resize', () => {
    programChanged = true;
    requestAnimationFrame(applyShader);
  });

  /**
   * The boilerplate for most shaders. It performs the following important tasks:
   * 1. Setting up the MVP (model view projection) matrix, necessary for correctly displaying the canvas texture.
   * 2. Setting up the VAO (vertex array object) so that it can be reused when drawing the triangles.
   * @param {WebGLProgram} prog
   * @param {WebGLVertexArrayObjectOES} [vao=undefined]
   */
  function setupConstantUniforms(prog, vao) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);

    // screen-size quad, triangle strip
    const vertices = new Float32Array([
      -1.0, 1.0,
      -1.0, -1.0,
      1.0, 1.0,
      1.0, -1.0
    ]);

    if (!vao) {
      vao = oes.createVertexArrayOES();
      oes.bindVertexArrayOES(vao);
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const a_position = gl.getAttribLocation(prog, 'a_position');
      gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(a_position);

      oes.bindVertexArrayOES(null);
      gl.deleteBuffer(vertexBuffer);
    }

    const source = gl.getUniformLocation(prog, 'Source');
    gl.uniform1i(source, 0); // Assuming texture unit 0

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

    const shaderChoices = ['crt', 'sepia', 'ntsc'];
    shaderModal.insertAdjacentHTML('afterbegin', `
      <div class="modalHeader">
        <h1 class="modalTitle">Shaders</h1>
      </div>
      <div class="modalContent">
        <ul class="formControls" style="width:100%">
          <li class="formControlRow">
            <label for="shaderEnableButton" class="unselectable">Enable Shaders</label>
            <div>
              <select id="shaderOptions" size="${Math.min(shaderChoices.length + 1, 4)}">
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
      programChanged = true;
      requestAnimationFrame(applyShader);

      initShaderControls();
    };

    document.getElementById('settingsModal').insertAdjacentElement('afterend', shaderModal);
    shaderModal.querySelector('#resetShaderButton').onclick = function() {
      if (!shaderConfig.active) return;
      for (const [name, param] of Object.entries(shaderKnobs[shaderConfig.active]))
        param.initValue(name, undefined, true);
      updateConfig(shaderConfig, true, 'shader');
    };
    function initShaderControls() {
      const $formControls = shaderModal.querySelector('.formControls');
      for (const input of $formControls.querySelectorAll('.js_shader'))
        input.remove();
      if (!shaderConfig.active)
        return;
      for (const [name, param] of Object.entries(shaderKnobs[shaderConfig.active])) {
        const row = param.init($formControls, name, shaderConfig.active);
        row.classList.add('js_shader');
      }
    }
  }
})();
