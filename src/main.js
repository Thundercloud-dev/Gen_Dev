import { createClient } from '@supabase/supabase-js'
import './style.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_KEY)
const supabase = supabaseReady ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

const $ = (id) => document.getElementById(id)
const canvas = $('game')
const ctx = canvas.getContext('2d')

const ui = {
  accountLabel: $('account-label'),
  signout: $('signout-button'),
  authCard: $('auth-card'),
  authForm: $('auth-form'),
  email: $('email'),
  password: $('password'),
  signup: $('signup-button'),
  authMessage: $('auth-message'),
  best: $('best-score'),
  coins: $('coin-count'),
  level: $('level-number'),
  score: $('score'),
  jumps: $('jump-count'),
  unlocked: $('unlocked-level'),
  saveStatus: $('save-status'),
  overlay: $('game-overlay'),
  overlayTitle: $('overlay-title'),
  overlayCopy: $('overlay-copy'),
  start: $('start-button'),
  restart: $('restart-button'),
  runStatus: $('run-status')
}

let user = null
let progress = { current_level: 1, unlocked_level: 1, total_jumps: 0, best_score: 0, coins: 0 }
let saveTimer = null
let running = false
let animationId = 0
let lastFrame = 0
let score = 0
let runCoins = 0
let runJumps = 0
let speed = 5
let spawnTimer = 0
let coinTimer = 0
let obstacles = []
let pickups = []
const groundY = 350
const player = { x: 105, y: groundY - 42, width: 48, height: 42, vy: 0, onGround: true }

function setMessage(message, isError = false) {
  ui.authMessage.textContent = message
  ui.authMessage.classList.toggle('error', isError)
}

function updateStats() {
  ui.best.textContent = String(progress.best_score)
  ui.coins.textContent = String(progress.coins)
  ui.level.textContent = String(progress.current_level)
  ui.jumps.textContent = String(progress.total_jumps)
  ui.unlocked.textContent = String(progress.unlocked_level)
}

function setSignedInState() {
  ui.accountLabel.textContent = user ? (user.email || 'Signed in') : 'Playing as Guest'
  ui.signout.classList.toggle('hidden', !user)
  ui.authCard.classList.toggle('hidden', Boolean(user))
  ui.saveStatus.textContent = user ? 'Cloud sync on' : 'Guest only'
}

async function loadProgress() {
  if (!user || !supabase) return
  ui.saveStatus.textContent = 'Loading…'
  const { data, error } = await supabase
    .from('parkour_progress')
    .select('current_level, unlocked_level, total_jumps, best_score, coins')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    ui.saveStatus.textContent = 'Load failed'
    setMessage('Could not load saved progress: ' + error.message, true)
    return
  }
  if (data) progress = { ...progress, ...data }
  updateStats()
  ui.saveStatus.textContent = 'Cloud sync on'
}

async function saveProgress() {
  if (!user || !supabase) {
    ui.saveStatus.textContent = 'Sign in to save'
    return
  }

  const payload = {
    user_id: user.id,
    current_level: progress.current_level,
    unlocked_level: progress.unlocked_level,
    total_jumps: progress.total_jumps,
    best_score: progress.best_score,
    coins: progress.coins,
    updated_at: new Date().toISOString()
  }

  ui.saveStatus.textContent = 'Saving…'
  const { error } = await supabase
    .from('parkour_progress')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    ui.saveStatus.textContent = 'Save failed'
    setMessage('Your run worked, but saving failed: ' + error.message, true)
    return
  }
  ui.saveStatus.textContent = 'Saved ✓'
}

function queueSave() {
  if (!user) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveProgress, 500)
}

async function signIn(event) {
  event.preventDefault()
  if (!supabase) {
    setMessage('Supabase settings are missing. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY variables in Vercel.', true)
    return
  }
  const email = ui.email.value.trim()
  const password = ui.password.value
  setMessage('Signing in…')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    setMessage(error.message, true)
    return
  }
  user = data.user
  await loadProgress()
  setSignedInState()
  setMessage('Welcome back! Your progress is loaded.')
}

async function signUp() {
  if (!supabase) {
    setMessage('Supabase settings are missing. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY variables in Vercel.', true)
    return
  }
  const email = ui.email.value.trim()
  const password = ui.password.value
  if (!email || password.length < 6) {
    setMessage('Enter an email and a password with at least 6 characters.', true)
    return
  }
  setMessage('Creating account…')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    setMessage(error.message, true)
    return
  }
  if (data.session) {
    user = data.user
    await loadProgress()
    setSignedInState()
    setMessage('Account created. Your progress will now sync.')
  } else {
    setMessage('Account created! Check your email to confirm, then sign in.')
  }
}

async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) {
    setMessage(error.message, true)
    return
  }
  user = null
  progress = { current_level: 1, unlocked_level: 1, total_jumps: 0, best_score: 0, coins: 0 }
  updateStats()
  setSignedInState()
  setMessage('Signed out. You can still play as a guest.')
}

function roundedRect(x, y, w, h, r, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function drawCloud(x, y, scale = 1, color = '#ffffff') {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 15 * scale, Math.PI * 0.5, Math.PI * 1.5)
  ctx.arc(x + 17 * scale, y - 10 * scale, 19 * scale, Math.PI, Math.PI * 1.85)
  ctx.arc(x + 39 * scale, y - 2 * scale, 15 * scale, Math.PI * 1.15, Math.PI * 2)
  ctx.lineTo(x + 53 * scale, y + 13 * scale)
  ctx.lineTo(x, y + 13 * scale)
  ctx.closePath()
  ctx.fill()
}

function drawScene() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, '#18264e')
  gradient.addColorStop(1, '#536a9d')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let i = 0; i < 7; i++) {
    const x = ((i * 173 - (score * 0.25) % 1100) + 1100) % 1100 - 80
    drawCloud(x, 80 + (i % 3) * 45, 0.65 + (i % 2) * 0.2, 'rgba(255,255,255,0.18)')
  }

  ctx.fillStyle = '#293b65'
  ctx.beginPath()
  ctx.moveTo(0, 285)
  for (let x = 0; x <= canvas.width; x += 90) {
    ctx.lineTo(x, 245 + Math.sin((x + score * 0.4) * 0.012) * 22)
  }
  ctx.lineTo(canvas.width, groundY)
  ctx.lineTo(0, groundY)
  ctx.closePath()
  ctx.fill()

  roundedRect(0, groundY, canvas.width, 70, 0, '#172342')
  ctx.fillStyle = '#8de0ff'
  ctx.fillRect(0, groundY, canvas.width, 4)
  for (let x = -((score * 2) % 50); x < canvas.width; x += 50) {
    ctx.fillStyle = 'rgba(141,224,255,0.18)'
    ctx.fillRect(x, groundY + 25, 24, 3)
  }

  pickups.forEach((coin) => {
    ctx.save()
    ctx.translate(coin.x, coin.y)
    ctx.fillStyle = '#ffd76b'
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff1ae'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()
  })

  obstacles.forEach((obstacle) => {
    roundedRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 8, '#ff7d8b')
    roundedRect(obstacle.x + 6, obstacle.y + 6, obstacle.width - 12, 7, 4, '#ffc0c6')
  })

  drawCloud(player.x + 18, player.y + 16, 0.55, '#ffffff')
  ctx.fillStyle = '#172342'
  ctx.beginPath()
  ctx.arc(player.x + 23, player.y + 13, 2.5, 0, Math.PI * 2)
  ctx.arc(player.x + 34, player.y + 13, 2.5, 0, Math.PI * 2)
  ctx.fill()
  roundedRect(player.x + 25, player.y + 24, 10, 3, 2, '#6a7da7')
}

function resetRun() {
  score = 0
  runCoins = 0
  runJumps = 0
  speed = 5
  spawnTimer = 0
  coinTimer = 0
  obstacles = []
  pickups = []
  player.y = groundY - player.height
  player.vy = 0
  player.onGround = true
  ui.score.textContent = '0'
}

function showOverlay(title, copy, buttonText) {
  ui.overlayTitle.textContent = title
  ui.overlayCopy.textContent = copy
  ui.start.textContent = buttonText
  ui.overlay.classList.remove('hidden')
}

function startRun() {
  cancelAnimationFrame(animationId)
  resetRun()
  running = true
  lastFrame = 0
  ui.overlay.classList.add('hidden')
  ui.runStatus.textContent = 'RUNNING'
  animationId = requestAnimationFrame(gameLoop)
}

function jump() {
  if (!running) return
  if (player.onGround) {
    player.vy = -13.5
    player.onGround = false
    runJumps += 1
  }
}

function finishRun() {
  running = false
  cancelAnimationFrame(animationId)
  ui.runStatus.textContent = 'RUN COMPLETE'
  progress.total_jumps += runJumps
  progress.coins += runCoins
  progress.best_score = Math.max(progress.best_score, Math.floor(score))
  progress.current_level = Math.max(progress.current_level, Math.floor(score / 100) + 1)
  progress.unlocked_level = Math.max(progress.unlocked_level, progress.current_level)
  updateStats()
  queueSave()
  showOverlay('Run complete!', 'Score: ' + Math.floor(score) + ' • Coins: ' + runCoins + ' • Jumps: ' + runJumps, 'Run again')
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
}

function update(delta) {
  const step = Math.min(delta / 16.67, 2)
  score += 0.12 * step * speed
  speed = Math.min(10, 5 + score / 450)
  player.vy += 0.65 * step
  player.y += player.vy * step
  if (player.y + player.height >= groundY) {
    player.y = groundY - player.height
    player.vy = 0
    player.onGround = true
  }

  spawnTimer += delta
  if (spawnTimer > Math.max(650, 1450 - speed * 75)) {
    spawnTimer = 0
    const height = 28 + Math.random() * 24
    obstacles.push({ x: canvas.width + 20, y: groundY - height, width: 25 + Math.random() * 20, height })
  }

  coinTimer += delta
  if (coinTimer > 1050) {
    coinTimer = 0
    pickups.push({ x: canvas.width + 20, y: groundY - 85 - Math.random() * 90, width: 20, height: 20 })
  }

  obstacles.forEach((item) => { item.x -= speed * step })
  pickups.forEach((item) => { item.x -= speed * step })
  obstacles = obstacles.filter((item) => item.x + item.width > -10)
  pickups = pickups.filter((item) => item.x > -20)

  const playerBox = { x: player.x + 7, y: player.y + 5, width: 40, height: 34 }
  for (const obstacle of obstacles) {
    if (intersects(playerBox, obstacle)) {
      finishRun()
      return
    }
  }

  pickups = pickups.filter((coin) => {
    if (intersects(playerBox, coin)) {
      runCoins += 1
      return false
    }
    return true
  })
  ui.score.textContent = String(Math.floor(score))
}

function gameLoop(timestamp) {
  if (!running) return
  const delta = lastFrame ? timestamp - lastFrame : 16.67
  lastFrame = timestamp
  update(delta)
  drawScene()
  if (running) animationId = requestAnimationFrame(gameLoop)
}

function handleJumpInput(event) {
  if (event.type === 'keydown' && !['Space', 'ArrowUp', 'KeyW'].includes(event.code)) return
  if (event.type === 'keydown') event.preventDefault()
  jump()
}

ui.authForm.addEventListener('submit', signIn)
ui.signup.addEventListener('click', signUp)
ui.signout.addEventListener('click', signOut)
ui.start.addEventListener('click', startRun)
ui.restart.addEventListener('click', startRun)
canvas.addEventListener('pointerdown', jump)
window.addEventListener('keydown', handleJumpInput)

drawScene()
updateStats()
setSignedInState()

if (!supabaseReady) {
  setMessage('Supabase environment variables are not configured yet.', true)
  ui.saveStatus.textContent = 'Not configured'
} else {
  supabase.auth.getSession().then(async ({ data, error }) => {
    if (error) setMessage(error.message, true)
    user = data.session?.user ?? null
    setSignedInState()
    if (user) await loadProgress()
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user ?? null
    setSignedInState()
    if (user) loadProgress()
  })
}
