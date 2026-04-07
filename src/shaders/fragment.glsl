precision highp float;

uniform vec2 uMeshSize;
uniform vec2 uTextureSize;
uniform sampler2D uTexture;
uniform sampler2D uAsciiMap;
uniform float uAsciiColorStep;
uniform float uAspect;
uniform float uTileSize;
uniform float uTileStrength;
uniform bool uBioMode;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseRadius;

varying vec2 vUv;
// タイルIDからランダムな値(0~1)を生成
float hash(vec2 tileId) {
  return fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uAspect, 1.0);
  vec2 tileUv = vUv * aspect * uTileSize;
  vec2 tileId = floor(tileUv);
  vec2 tileLocal = fract(tileUv);

  uv = (tileId + 0.5) / (aspect * uTileSize);

  vec2 resolutionRatio = vec2(
    min((uMeshSize.x / uMeshSize.y) / (uTextureSize.x / uTextureSize.y), 1.0),
    min((uMeshSize.y / uMeshSize.x) / (uTextureSize.y / uTextureSize.x), 1.0)
  );
  uv -= 0.5;
  uv *= resolutionRatio;
  uv += 0.5;

  // 元画像用UV（アスペクト比補正済み、タイルスナップなし）
  vec2 originalUv = vUv - 0.5;
  originalUv *= resolutionRatio;
  originalUv += 0.5;

  vec4 tex = texture2D(uTexture, uv);
  vec4 tex2 = texture2D(uTexture, originalUv);
  float grayScale = dot(vec3(0.298912, 0.586611, 0.114478), tex.rgb);
// コントラスト強調（値を大きくするほど強調）
grayScale = clamp((grayScale - 0.1) * 2.0 + 0.5, 0.0, 1.0);
  float shift = floor(grayScale / uAsciiColorStep) * uAsciiColorStep;
  //  shift = 1.0 - shift;

  vec2 tile = tileLocal;
  tile = (tile - 0.5) * uTileStrength + 0.5;
  tile = clamp(tile, 0.005, 0.975);
  tile.x = tile.x * uAsciiColorStep + (shift * clamp(1.0, 0.0, 1.0));

  float asciiTexture = texture2D(uAsciiMap, tile).r;
  // asciiTexture = smoothstep(0.2, 1.8, asciiTexture);
  asciiTexture *= 0.5 + 0.5 * sin(uTime * (1.0 + hash(tileId) * 0.1) + hash(tileId) * 6.2831);
  vec3 color;
  if (uBioMode) {
    color = vec3(0.9725, 0.9568, 0.9372);
  } else {
    color = vec3(0.0);
  }

  // マウス周辺は元画像を表示
  vec2 mouseUv = uMouse ;
  float dist = distance(vUv * vec2(uAspect, 1.0), mouseUv * vec2(uAspect, 1.0));
  float reveal = smoothstep(uMouseRadius, uMouseRadius * 0.5, dist);

  float alpha = 1.0 - asciiTexture;

  // revealが1に近いほど元画像を表示
  vec4 asciiColor = vec4(color, alpha);
  vec4 originalColor = tex2;
  gl_FragColor = mix(asciiColor, originalColor, reveal);
}
