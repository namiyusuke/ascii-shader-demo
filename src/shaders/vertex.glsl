precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform vec2 uResolution;
uniform vec2 uDomXY;
uniform vec2 uDomWH;
uniform vec2 uScrollOffset;

varying vec2 vUv;

void main() {
  vec2 pixelXY = uDomXY - uScrollOffset + uDomWH * 0.5;
  pixelXY.y = uResolution.y - pixelXY.y;
  pixelXY += position.xy * uDomWH;

  vec2 xy = pixelXY / uResolution * 2.0 - 1.0;

  vUv = uv;
  gl_Position = vec4(xy, 0.0, 1.0);
}
