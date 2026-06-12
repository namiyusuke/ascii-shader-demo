precision highp float;

uniform vec2 uMeshSize;
uniform vec2 uTextureSize;
uniform sampler2D uTexture;
uniform sampler2D uAsciiMap;
uniform float uAsciiColorStep;
uniform float uAspect;
uniform float uTileStrength;
uniform float uTime;
uniform vec2 uMouse;       // カード内UV (0~1)。未ホバー時は(-1,-1)
uniform float uHover;      // 0~1 ホバー進行度
uniform vec3 uInkColor;    // ASCII文字色

uniform float uBaseTiles;   // 粗い状態のタイル数（基準解像度）
uniform float uMaxLevel;    // レンズ中心での再分割段数
uniform float uLensRadius;  // レンズ半径（UV空間, アスペクト補正後）
uniform float uColorAmount; // 0=単色 / 1=元画像の色で着色

// ── 改善版インタラクション用 uniform ──
uniform float uVelBoost;    // 0~ : 素早く撫でるとレンズ半径が一時的に広がる
uniform vec2  uClickPos;    // クリック位置 UV
uniform float uClickAge;    // クリックからの経過秒（-1=パルス無し）

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float luma(vec3 c) {
  return dot(vec3(0.298912, 0.586611, 0.114478), c);
}

void main() {
  vec2 aspect = vec2(uAspect, 1.0);

  // cover フィット用の比率
  vec2 resolutionRatio = vec2(
    min((uMeshSize.x / uMeshSize.y) / (uTextureSize.x / uTextureSize.y), 1.0),
    min((uMeshSize.y / uMeshSize.x) / (uTextureSize.y / uTextureSize.x), 1.0)
  );

  // ── 粗いセル中心とマウスの距離から再分割レベルを決定（セル単位で一定 → シームレスに入れ子）──
  float coarse = uBaseTiles;
  vec2 cId = floor(vUv * aspect * coarse);
  vec2 cCenter = (cId + 0.5) / (aspect * coarse);     // 粗いセル中心 (vUv)

  // 速度ブースト: 素早く撫でるとレンズ半径がふわっと広がる
  float R = uLensRadius * uHover * (1.0 + uVelBoost);
  float level = 0.0;
  if (R > 0.0001) {
    float d = distance(cCenter * aspect, uMouse * aspect);
    float t = clamp(1.0 - d / R, 0.0, 1.0);
    t = t * t;                                        // 中心ほど急峻に
    level = floor(t * (uMaxLevel + 0.999));
  }

  // ── クリックパルス: クリック点から外へ広がる輪 ──
  //   ・波面(pulse)はキラッと光らせる
  //   ・波が通過した内側はASCIIのまま解像度が上がって絵が出る → やがて元へ戻る
  float pulse = 0.0;
  if (uClickAge >= 0.0) {
    const float PULSE_DUR = 3.0;
    float ringR = uClickAge * 1.5;                    // 輪の半径が時間で広がる

    // すべて粗いセル中心ベースで判定（levelの量子化＝入れ子に合わせる）
    float dC = distance(cCenter * aspect, uClickPos * aspect);
    float ring = exp(-pow((dC - ringR) / 0.06, 2.0)); // ガウシアンの輪
    // 寿命: 後半でゆっくり減衰し、最後にASCIIへ戻る
    float life = 1.0 - smoothstep(PULSE_DUR * 0.55, PULSE_DUR, uClickAge);
    pulse = ring * life;

    // 波が通過した内側をASCIIのまま高解像度化（整数量子化で入れ子維持）
    float inside = smoothstep(ringR, ringR - 0.12, dC); // 波面の内側=1
    level = max(level, floor(inside * life * (uMaxLevel + 0.999)));
  }

  // 2のべき乗で再分割するので粗いグリッドに完全に入れ子になる（境界が割れない）
  float tileCount = coarse * pow(2.0, level);

  // ── 選択した解像度で ASCII 化 ──
  vec2 tileUv = vUv * aspect * tileCount;
  vec2 tileId = floor(tileUv);
  vec2 tileLocal = fract(tileUv);

  vec2 sampUv = (tileId + 0.5) / (aspect * tileCount);
  sampUv = (sampUv - 0.5) * resolutionRatio + 0.5;
  vec3 texc = texture2D(uTexture, sampUv).rgb;

  float g = luma(texc);

  // 文字の種類はコントラストを付けた輝度で選ぶ
  float gc = clamp((g - 0.08) * 1.7 + 0.35, 0.0, 1.0);
  float shift = floor(gc / uAsciiColorStep) * uAsciiColorStep;

  vec2 tile = (tileLocal - 0.5) * uTileStrength + 0.5;
  tile = clamp(tile, 0.005, 0.975);
  tile.x = tile.x * uAsciiColorStep + shift;

  float ascii = texture2D(uAsciiMap, tile).r;          // 文字部分が高い
  ascii *= 0.92 + 0.08 * sin(uTime * 1.6 + hash(tileId) * 6.2831); // ごく軽いゆらぎ

  // ── 階調を復活させる: 元画像の色と明るさで文字を着色 ──
  // 暗部は暗く・明部は明るく → 文字のままでも何の絵か読み取れる
  float tone = pow(clamp(g * 1.15, 0.0, 1.0), 0.6);
  vec3 col = mix(vec3(luma(texc)), texc, 2.4); // 彩度1.4倍
  vec3 baseInk = mix(uInkColor, col, uColorAmount);   // 元色で着色
  vec3 ink = baseInk * (0.18 + 1.35 * tone);

  // 細かいタイル（レンズ中心）ほどわずかに際立たせる
  float lift = level / max(uMaxLevel, 1.0);
  ink *= 1.0 + 0.2 * lift;

  // クリック波紋の輪をきらめかせる
  ink *= 1.0 + 0.5 * pulse;

  gl_FragColor = vec4(ink, ascii);
}
