import * as THREE from 'three'
import './cards.css'
import vertexShader from './shaders/vertex.glsl'
import cardFragmentShader from './shaders/card-fragment.glsl' // uVelBoost / uClickPos / uClickAge 対応版
import image01Url from './img/image01.png'
import image02Url from './img/image02.png'

// ============================================================
// ASCII Lens — JS側インタラクション改善版
//
// 元コードからの変更点:
//  1. マウス追従に慣性(exp減衰・フレームレート非依存)
//  2. ホバーの入りは速め・抜けはゆったり(非対称λ)
//  3. pointerleaveでuMouseを(-1,-1)に飛ばさない
//     → レンズは最後の位置に留まり、その場で縮んで消える
//  4. pointerenterで侵入点にスナップ(レンズが横切って飛んでこない)
//  5. 速度連動: 素早く撫でるとレンズがふわっと張る(uVelBoost)
//  6. クリックパルス(uClickPos / uClickAge)
//  7. dtに上限を設けてタブ復帰時の暴れを防止
// ============================================================

// ─── ASCII 文字マップ生成（元デモと同じ手法）───
function generateAsciiMap(chars) {
  const cols = chars.length
  const cellSize = 64
  const canvas = document.createElement('canvas')
  canvas.width = cellSize * cols
  canvas.height = cellSize
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${cellSize * 0.75}px "Courier New", monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < cols; i++) {
    ctx.fillText(chars[i], cellSize * i + cellSize / 2, cellSize / 2)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  return { texture: tex, count: cols }
}

const asciiChars = ' .:-=+*#%@'
const { texture: asciiMapTex, count: asciiCount } = generateAsciiMap(asciiChars)
const asciiColorStep = 1.0 / asciiCount

// ─── テクスチャ読み込み（width/height を保持）───
const loader = new THREE.TextureLoader()
function loadTexture(url) {
  const entry = { texture: null, width: 1, height: 1 }
  entry.texture = loader.load(url, (t) => {
    entry.width = t.image.width
    entry.height = t.image.height
    cards.forEach((c) => {
      if (c.texUrl === url) c.uniforms.uTextureSize.value.set(entry.width, entry.height)
    })
  })
  entry.texture.minFilter = THREE.LinearFilter
  entry.texture.magFilter = THREE.LinearFilter
  return entry
}

const imgPool = {
  [image01Url]: loadTexture(image01Url),
  [image02Url]: loadTexture(image02Url),
}

// ─── カード定義 ───
const cardData = [
  { title: 'NEBULA',   sub: 'fragment 01', img: image01Url },
  { title: 'TERRAIN',  sub: 'fragment 02', img: image02Url },
  { title: 'CIRCUIT',  sub: 'fragment 03', img: image01Url },
  { title: 'GLACIER',  sub: 'fragment 04', img: image02Url },
  { title: 'AURORA',   sub: 'fragment 05', img: image01Url },
  { title: 'MONOLITH', sub: 'fragment 06', img: image02Url },
]

// ─── Three.js セットアップ ───
const canvasEl = document.getElementById('gl-canvas')
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x000000, 0)

const scene = new THREE.Scene()
const camera = new THREE.Camera()

const geometry = new THREE.PlaneGeometry(1, 1)
const inkColor = new THREE.Color(0xf5f2ec)

// フレームレート非依存の指数減衰補間。
// 「current + (target-current)*0.12」のような固定係数lerpは
// リフレッシュレートで体感速度が変わるため、dtベースに置き換える。
function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt))
}

// インタラクションの味付けパラメータ(好みに合わせて調整)
const FOLLOW_LAMBDA = 8      // マウス追従: 小=ねっとり遅い / 大=機敏
const HOVER_IN_LAMBDA = 7    // ホバー進入の速さ
const HOVER_OUT_LAMBDA = 2.5 // ホバー離脱の速さ(低速)
const VEL_GAIN = 1.2         // 移動距離→半径ブーストの変換係数
const VEL_MAX = 0.4          // 半径ブーストの上限(+40%)
const VEL_DECAY_LAMBDA = 4   // ブーストがゼロに戻る速さ
const PULSE_DURATION = 3.0   // クリック波紋の寿命(秒)

// ─── カード生成 ───
const gridEl = document.getElementById('grid')
const cards = []

cardData.forEach((data, i) => {
  const el = document.createElement('div')
  el.className = 'card'
  el.innerHTML = `
    <div class="card__label">
      <div class="card__index">0${i + 1} / 0${cardData.length}</div>
      <div class="card__title">${data.title}<small>${data.sub}</small></div>
    </div>`
  gridEl.appendChild(el)

  const img = imgPool[data.img]
  const uniforms = {
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uDomXY: { value: new THREE.Vector2(0, 0) },
    uDomWH: { value: new THREE.Vector2(1, 1) },
    uScrollOffset: { value: new THREE.Vector2(0, 0) },
    uMeshSize: { value: new THREE.Vector2(1, 1) },
    uTextureSize: { value: new THREE.Vector2(img.width, img.height) },
    uTexture: { value: img.texture },
    uAsciiMap: { value: asciiMapTex },
    uAsciiColorStep: { value: asciiColorStep },
    uAspect: { value: 1 },
    uTileStrength: { value: 1.0 },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) }, // (-1,-1)はやめて中央初期化
    uHover: { value: 0 },
    uInkColor: { value: inkColor },
    uBaseTiles: { value: 10.0 },
    uMaxLevel: { value: 7.0 },    // 10は重い&過剰なので7程度が気持ちいい
    uLensRadius: { value: 0.7 },
    uColorAmount: { value: 0.7 },
    // ── 追加 uniform(改善版シェーダーが参照) ──
    uVelBoost: { value: 0 },
    uClickPos: { value: new THREE.Vector2(0.5, 0.5) },
    uClickAge: { value: -1 },
  }

  const material = new THREE.RawShaderMaterial({
    vertexShader,
    fragmentShader: cardFragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const card = {
    el, mesh, uniforms,
    texUrl: data.img,
    hoverTarget: 0,
    mouseTarget: new THREE.Vector2(0.5, 0.5), // 生のマウス位置
    mouseSmooth: new THREE.Vector2(0.5, 0.5), // 慣性付きの追従位置
    velBoost: 0,
    lastMove: null,
    clickStart: -1,
  }
  cards.push(card)

  // カード内UV(0~1, Y上向き=UVと一致)へ変換
  const toUv = (e) => {
    const r = el.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) / r.width,
      y: 1.0 - (e.clientY - r.top) / r.height,
    }
  }

  // ── ホバー / マウス追従 ──
  el.addEventListener('pointerenter', (e) => {
    card.hoverTarget = 1
    // 侵入点にスナップ: 前回位置からレンズが横切って飛んでくるのを防ぐ
    const uv = toUv(e)
    card.mouseTarget.set(uv.x, uv.y)
    card.mouseSmooth.set(uv.x, uv.y)
    card.lastMove = { x: uv.x, y: uv.y }
  })

  el.addEventListener('pointerleave', () => {
    card.hoverTarget = 0
    // uMouseはリセットしない: レンズは最後の位置でそのまま縮んで消える
  })

  el.addEventListener('pointermove', (e) => {
    const uv = toUv(e)
    card.mouseTarget.set(uv.x, uv.y)
    // 移動距離→速度ブースト(撫でる速さでレンズが張る)
    if (card.lastMove) {
      const dx = uv.x - card.lastMove.x
      const dy = uv.y - card.lastMove.y
      card.velBoost = Math.min(card.velBoost + Math.hypot(dx, dy) * VEL_GAIN, VEL_MAX)
    }
    card.lastMove = { x: uv.x, y: uv.y }
  })

  el.addEventListener('pointerdown', (e) => {
    // クリック位置から細分化の波紋を発生させる
    const uv = toUv(e)
    card.uniforms.uClickPos.value.set(uv.x, uv.y)
    card.clickStart = (performance.now() - startTime) / 1000
  })
})

// ─── リサイズ ───
function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h)
  cards.forEach((c) => c.uniforms.uResolution.value.set(w, h))
}
window.addEventListener('resize', onResize)

// ─── 描画ループ ───
const startTime = performance.now()
let prevT = 0

function animate() {
  const t = (performance.now() - startTime) / 1000.0
  const dt = Math.min(t - prevT, 1 / 20) // タブ復帰時の巨大なdtで暴れないよう上限
  prevT = t

  cards.forEach((c) => {
    const r = c.el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) {
      c.mesh.visible = false
      return
    }
    c.mesh.visible = true

    c.uniforms.uDomXY.value.set(r.left, r.top)
    c.uniforms.uDomWH.value.set(r.width, r.height)
    c.uniforms.uMeshSize.value.set(r.width, r.height)
    c.uniforms.uAspect.value = r.width / r.height
    c.uniforms.uTime.value = t

    // マウスに慣性(固定係数lerpではなくdtベースのexp減衰)
    const m = c.mouseSmooth
    m.x = damp(m.x, c.mouseTarget.x, FOLLOW_LAMBDA, dt)
    m.y = damp(m.y, c.mouseTarget.y, FOLLOW_LAMBDA, dt)
    c.uniforms.uMouse.value.copy(m)

    // 非対称ホバー: 入りは速く、抜けはゆったり
    const lambda = c.hoverTarget > 0.5 ? HOVER_IN_LAMBDA : HOVER_OUT_LAMBDA
    c.uniforms.uHover.value = damp(c.uniforms.uHover.value, c.hoverTarget, lambda, dt)

    // 速度ブーストは常時ゼロへ減衰
    c.velBoost = damp(c.velBoost, 0, VEL_DECAY_LAMBDA, dt)
    c.uniforms.uVelBoost.value = c.velBoost

    // クリック経過秒(未クリック・波紋終了後は-1)
    if (c.clickStart >= 0) {
      const age = t - c.clickStart
      c.uniforms.uClickAge.value = age < PULSE_DURATION ? age : -1
      if (age >= PULSE_DURATION) c.clickStart = -1
    } else {
      c.uniforms.uClickAge.value = -1
    }
  })

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()
