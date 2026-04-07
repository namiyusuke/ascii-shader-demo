import * as THREE from 'three'
import './style.css'
import vertexShader from './shaders/vertex.glsl'
import fragmentShader from './shaders/fragment.glsl'
import bgVertexShader from './shaders/bg-vertex.glsl'
import bgFragmentShader from './shaders/bg-fragment.glsl'
import image01Url from './img/image01.png'
import image02Url from './img/image02.png'
import videoUrl from './img/video.mp4'

// ─── ASCII character map generation ───
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

// ─── Load image textures ───
const loader = new THREE.TextureLoader()
const imageSources = [image01Url, image02Url]

function loadImages() {
  return imageSources.map(src => {
    const tex = loader.load(src)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return { texture: tex }
  })
}

// ─── Setup ───
const container = document.getElementById('canvas-container')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setClearColor(0x0a0a0a, 1)
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100)
camera.position.z = 5

// ASCII map
const asciiChars = '⬜︎⬜︎⬜︎⬜︎'
const { texture: asciiMapTex, count: asciiCount } = generateAsciiMap(asciiChars)
const asciiColorStep = 1.0 / asciiCount

// Images
let currentImageIndex = 0
const images = loadImages()

// Video
const video = document.createElement('video')
video.src = videoUrl
video.loop = true
video.muted = true
video.playsInline = true
const videoTexture = new THREE.VideoTexture(video)
videoTexture.minFilter = THREE.LinearFilter
videoTexture.magFilter = THREE.LinearFilter
let videoActive = false

// Mesh dimensions (simulating a centered DOM element)
const meshW = window.innerWidth * 0.7
const meshH = window.innerHeight * 0.75

const uniforms = {
  uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  uDomXY: { value: new THREE.Vector2((window.innerWidth - meshW) / 2, (window.innerHeight - meshH) / 2) },
  uDomWH: { value: new THREE.Vector2(meshW, meshH) },
  uScrollOffset: { value: new THREE.Vector2(0, 0) },
  uMeshSize: { value: new THREE.Vector2(meshW, meshH) },
  uTextureSize: { value: new THREE.Vector2(images[0].width, images[0].height) },
  uTexture: { value: images[0].texture },
  uAsciiMap: { value: asciiMapTex },
  uAsciiColorStep: { value: asciiColorStep },
  uAspect: { value: meshW / meshH },
  uTileSize: { value: 32.0 },
  uTileStrength: { value: 1.0 },
  uBioMode: { value: false },
  uTime: { value: 0},
  uMouse: { value: new THREE.Vector2(-1, -1) },
  uMouseRadius: { value: 0.15 },
}

// Background plane (shows behind the ASCII layer)
const bgGeo = new THREE.PlaneGeometry(1, 1)
const bgMat = new THREE.RawShaderMaterial({
  vertexShader: bgVertexShader,
  fragmentShader: bgFragmentShader,
  uniforms: {
    uResolution: uniforms.uResolution,
    uDomXY: uniforms.uDomXY,
    uDomWH: uniforms.uDomWH,
    uScrollOffset: uniforms.uScrollOffset,
    uBioMode: uniforms.uBioMode,
  },
})
const bgMesh = new THREE.Mesh(bgGeo, bgMat)
scene.add(bgMesh)

// ASCII plane
const geo = new THREE.PlaneGeometry(1, 1)
const mat = new THREE.RawShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms,
  transparent: true,
  depthTest: false,
})
const mesh = new THREE.Mesh(geo, mat)
scene.add(mesh)

// ─── UI Controls ───
const tileSizeInput = document.getElementById('tileSize')
const tileSizeVal = document.getElementById('tileSizeVal')
const tileStrengthInput = document.getElementById('tileStrength')
const tileStrengthVal = document.getElementById('tileStrengthVal')
const bioToggle = document.getElementById('bioToggle')
const imgToggle = document.getElementById('imgToggle')

tileSizeInput.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value)
  uniforms.uTileSize.value = v
  tileSizeVal.textContent = v
})

tileStrengthInput.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value)
  uniforms.uTileStrength.value = v
  tileStrengthVal.textContent = v.toFixed(2)
})

bioToggle.addEventListener('click', () => {
  uniforms.uBioMode.value = !uniforms.uBioMode.value
  bioToggle.classList.toggle('active', uniforms.uBioMode.value)
  document.body.style.background = uniforms.uBioMode.value ? '#f8f5f0' : '#0a0a0a'
  renderer.setClearColor(uniforms.uBioMode.value ? 0xf8f5f0 : 0x0a0a0a, 1)
})

imgToggle.addEventListener('click', () => {
  currentImageIndex = (currentImageIndex + 1) % images.length
  const img = images[currentImageIndex]
  uniforms.uTexture.value = img.texture
  uniforms.uTextureSize.value.set(img.width, img.height)
})

const videoToggle = document.getElementById('videoToggle')
videoToggle.addEventListener('click', () => {
  videoActive = !videoActive
  videoToggle.classList.toggle('active', videoActive)
  if (videoActive) {
    video.play()
    uniforms.uTexture.value = videoTexture
    uniforms.uTextureSize.value.set(video.videoWidth || 1920, video.videoHeight || 1080)
  } else {
    video.pause()
    const img = images[currentImageIndex]
    uniforms.uTexture.value = img.texture
    uniforms.uTextureSize.value.set(img.width, img.height)
  }
})

// ─── Mouse ───
renderer.domElement.addEventListener('mousemove', (e) => {
  const domX = uniforms.uDomXY.value.x
  const domY = uniforms.uDomXY.value.y
  const domW = uniforms.uDomWH.value.x
  const domH = uniforms.uDomWH.value.y
  // マウス座標をメッシュ内UV空間(0~1)に変換
  const mx = (e.clientX - domX) / domW
  const my = (e.clientY - domY) / domH
  uniforms.uMouse.value.set(mx, 1.0 - my)
})
renderer.domElement.addEventListener('mouseleave', () => {
  uniforms.uMouse.value.set(-1, -1)
})

// ─── Resize ───
function onResize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()

  const mw = w * 0.7
  const mh = h * 0.75
  uniforms.uResolution.value.set(w, h)
  uniforms.uDomXY.value.set((w - mw) / 2, (h - mh) / 2)
  uniforms.uDomWH.value.set(mw, mh)
  uniforms.uMeshSize.value.set(mw, mh)
  uniforms.uAspect.value = mw / mh
}
window.addEventListener('resize', onResize)
let time = 0
const startTime= performance.now();
// ─── Animate ───
function animate() {
  const endtime = performance.now();
  time = endtime - startTime;
  uniforms.uTime.value = time/1000.0;
  requestAnimationFrame(animate)
  renderer.render(scene, camera)
}
animate()
