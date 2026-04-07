precision highp float;

uniform bool uBioMode;

void main() {
  vec3 color = uBioMode ? vec3(0.12, 0.11, 0.10) : vec3(0.96, 0.94, 0.91);
  gl_FragColor = vec4(color, 1.0);
}
