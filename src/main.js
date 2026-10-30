import { createClient } from '@supabase/supabase-js'
import './style.css'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const db = url && key ? createClient(url, key, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}) : null
const $ = id => document.getElementById(id)
const MAX_MEDIA_SIZE = 25 * 1024 * 1024
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
let user = null
let session = null
let profile = null
let posts = []
let filter = 'all'
let progress = { current_level: 1, unlocked_level: 1, total_jumps: 0, best_score: 0, coins: 0 }
let game
let activeChatChannel = 'general'
let chatSubscription = null
let chatRefreshTimer = null
let lastChatSend = 0
let pointMissions = []
let pointClaims = []
let selectedPointMission = null

function modal(id, show = true) { $(id).classList.toggle('hidden', !show) }
function message(id, text, error = false) {
  const node = $(id)
  node.textContent = text
  node.classList.toggle('error', error)
}
function safeFileName(name) {
  return (name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'upload'
}
function isAllowedMedia(file, imagesOnly = false) {
  if (!file) return false
  const allowed = imagesOnly ? MEDIA_TYPES.slice(0, 4) : MEDIA_TYPES
  return allowed.includes(file.type) && file.size <= (imagesOnly ? 5 : 25) * 1024 * 1024
}
function publicMediaUrl(path) {
  if (!db || !path) return ''
  return db.storage.from('community-media').getPublicUrl(path).data.publicUrl
}
function accountUI() {
  const label = profile?.display_name || profile?.username || user?.email || 'Browsing as guest'
  $('account').textContent = user ? label : 'Browsing as guest'
  $('auth-open').classList.toggle('hidden', !!user)
  $('signout').classList.toggle('hidden', !user)
  $('save-status').textContent = user ? 'Signed in — your best score syncs.' : 'Playing as guest — sign in to save.'
  renderOwnProfile()
}
async function ensureProfile() {
  if (!db || !user) { profile = null; return }
  const { data, error } = await db.from('profiles')
    .select('id,username,display_name,avatar_path,role_tag,featured_badge')
    .eq('id', user.id)
    .maybeSingle()
  if (error) { console.warn('Profile lookup failed:', error.message); return }
  if (data) { profile = data; return }
  const username = 'runner_' + user.id.replace(/-/g, '').slice(0, 10)
  const displayName = String(user.user_metadata?.account_name || user.user_metadata?.display_name || 'Runner').trim().slice(0, 30)
  const { data: created, error: createError } = await db.from('profiles')
    .insert({ id: user.id, username, display_name: displayName, role_tag: 'community' })
    .select('id,username,display_name,avatar_path')
    .single()
  if (!createError) profile = created
  else console.warn('Profile creation failed:', createError.message)
}
function view(name) {
  for (const id of ['community', 'players', 'rewards', 'game', 'shop', 'chat', 'speedruns', 'integrations']) {
    $('' + id + '-view').classList.toggle('hidden', id !== name)
  }
  document.querySelectorAll('.tab').forEach(button => button.classList.toggle('active', button.dataset.view === name))
  if (name === 'game') game.draw()
  if (name === 'players') { renderOwnProfile(); loadPlayers() }
  if (name === 'rewards') loadPoints()
  if (name === 'chat') startChat()
  else stopChat()
  if (name === 'speedruns') loadSpeedrunGames('')
  if (name === 'integrations') setupIntegrations()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => view(button.dataset.view)))
document.querySelectorAll('[data-goto]').forEach(button => button.addEventListener('click', () => view(button.dataset.goto)))
$('explore').onclick = () => $('community-view').scrollIntoView({ behavior: 'smooth' })
$('year').textContent = new Date().getFullYear()

function validUrl(raw) {
  if (!raw) return null
  try {
    const parsed = new URL(raw)
    return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null
  } catch { return null }
}
function renderPosts() {
  const root = $('posts')
  root.replaceChildren()
  const query = $('search').value.trim().toLowerCase()
  const list = posts.filter(post =>
    (filter === 'all' || post.post_type === filter) &&
    (!query || [post.title, post.body, post.username].join(' ').toLowerCase().includes(query))
  )
  if (!list.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = posts.length ? 'No posts match your search.' : 'No posts yet — be the first to share a clip or tip.'
    root.append(empty)
    return
  }
  for (const post of list) {
    const card = document.createElement('article')
    card.className = 'post'
    const meta = document.createElement('div')
    meta.className = 'post-meta'
    const tag = document.createElement('span')
    tag.className = 'tag ' + post.post_type
    tag.textContent = ({clip:'▶ CLIP',video:'▶ VIDEO',tip:'✦ TIP',project:'⌘ PROJECT',discussion:'☰ DISCUSSION',defeat:'⚡ DEFEAT'})[post.post_type] || post.post_type.toUpperCase()
    const date = document.createElement('span')
    date.textContent = new Date(post.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    meta.append(tag, date)
    const title = document.createElement('h3')
    title.textContent = post.title
    const body = document.createElement('p')
    body.textContent = post.body
    card.append(meta, title, body)

    if (post.media_path) {
      const mediaBox = document.createElement('div')
      mediaBox.className = 'post-media'
      const mediaUrl = publicMediaUrl(post.media_path)
      if (/\.(mp4|webm)$/i.test(post.media_path)) {
        const video = document.createElement('video')
        video.src = mediaUrl
        video.controls = true
        video.preload = 'metadata'
        video.playsInline = true
        video.setAttribute('aria-label', 'Community video')
        mediaBox.append(video)
      } else {
        const image = document.createElement('img')
        image.src = mediaUrl
        image.alt = 'Community upload'
        image.loading = 'lazy'
        mediaBox.append(image)
      }
      card.append(mediaBox)
    }

    const link = validUrl(post.link_url)
    if (link) {
      const anchor = document.createElement('a')
      anchor.className = 'post-link'
      anchor.href = link
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.textContent = post.post_type === 'clip' ? 'Open clip link ↗' : 'Open reference ↗'
      card.append(anchor)
    }
    const foot = document.createElement('div')
    foot.className = 'post-foot'
    const author = document.createElement('span')
    author.textContent = '●  ' + (post.username || 'Runner')
    foot.append(author)
    if (user && user.id === post.user_id) {
      const del = document.createElement('button')
      del.className = 'delete'
      del.textContent = 'Delete'
      del.onclick = () => deletePost(post.id, post.media_path)
      foot.append(del)
    }
    if (['clip', 'video'].includes(post.post_type) && (!user || user.id !== post.user_id)) {
      const support = document.createElement('button')
      support.className = 'support-creator'
      support.textContent = '♡ Support creator'
      support.onclick = () => modal('donation-info-modal')
      card.append(support)
    }
    card.append(foot)
    root.append(card)
  }
}
async function loadPosts() {
  if (!db) { $('posts').textContent = 'Supabase is not configured. Add the VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY variables in Vercel.'; return }
  const { data, error } = await db.from('community_posts')
    .select('id,user_id,username,post_type,title,body,link_url,media_path,created_at')
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) { $('posts').textContent = 'Could not load posts: ' + error.message; return }
  posts = data || []
  renderPosts()
}
async function deletePost(id, mediaPath) {
  if (!user || !db || !confirm('Delete this post?')) return
  const { error } = await db.from('community_posts').delete().eq('id', id).eq('user_id', user.id)
  if (error) { alert(error.message); return }
  if (mediaPath) {
    const { error: removeError } = await db.storage.from('community-media').remove([mediaPath])
    if (removeError) console.warn('Post removed, but its file could not be removed:', removeError.message)
  }
  await loadPosts()
}
document.querySelectorAll('[data-filter]').forEach(button => {
  button.onclick = () => {
    filter = button.dataset.filter
    document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button))
    renderPosts()
  }
})
$('search').oninput = renderPosts
function openPost() {
  if (user) modal('post-modal')
  else { setAuthMode('signin'); modal('auth-modal') }
}
$('post-open').onclick = openPost
$('share').onclick = openPost
$('auth-open').onclick = () => { setAuthMode('signin'); modal('auth-modal') }
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => modal(button.dataset.close, false))

$('post-form').onsubmit = async event => {
  event.preventDefault()
  if (!user || !db) { modal('post-modal', false); setAuthMode('signin'); modal('auth-modal'); return }
  const rawLink = $('post-link').value.trim()
  const link = validUrl(rawLink)
  if (rawLink && !link) return message('post-message', 'Please enter a valid http or https link.', true)
  const file = $('post-file').files?.[0] || null
  if (file && !isAllowedMedia(file)) return message('post-message', 'Choose a JPG, PNG, WEBP, GIF, MP4, or WEBM file smaller than 25 MB.', true)

  const button = $('publish')
  button.disabled = true
  button.textContent = 'Publishing…'
  let mediaPath = null
  try {
    if (file) {
      mediaPath = user.id + '/' + crypto.randomUUID() + '-' + safeFileName(file.name)
      const { error: uploadError } = await db.storage.from('community-media').upload(mediaPath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      })
      if (uploadError) throw uploadError
    }
    const username = profile?.username || 'Runner'
    const { error } = await db.from('community_posts').insert({
      user_id: user.id,
      username,
      post_type: $('post-type').value,
      title: $('post-title').value.trim(),
      body: $('post-body').value.trim(),
      link_url: link,
      media_path: mediaPath
    })
    if (error) throw error
    $('post-form').reset()
    modal('post-modal', false)
    message('post-message', '')
    await loadPosts()
  } catch (error) {
    if (mediaPath) await db.storage.from('community-media').remove([mediaPath])
    message('post-message', error.message || 'Upload failed. Please try again.', true)
  } finally {
    button.disabled = false
    button.textContent = 'Publish post'
  }
}


function switchAuthPanel(panelId) {
  for (const id of ['auth-form', 'reset-form', 'mfa-login-panel']) {
    $(id).classList.toggle('hidden', id !== panelId)
  }
}
function passwordProblems(password) {
  const problems = []
  if (password.length < 12) problems.push('at least 12 characters')
  if (!/[a-z]/.test(password)) problems.push('a lowercase letter')
  if (!/[A-Z]/.test(password)) problems.push('an uppercase letter')
  if (!/[0-9]/.test(password)) problems.push('a number')
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('a symbol')
  return problems
}
function clearSignedInState() {
  user = null
  session = null
  profile = null
  progress = { current_level: 1, unlocked_level: 1, total_jumps: 0, best_score: 0, coins: 0 }
  pointClaims = []
  authGateToken = null
  pendingLoginMfa = null
  accountUI()
  $('best').textContent = '0'
  renderOwnProfile()
  void renderMfaSettings()
  void loadPoints()
  loadPosts()
}
let authGateBusy = false
let authGateToken = null
let pendingLoginMfa = null

async function handleAuthSession(nextSession) {
  if (!db || !nextSession?.user || authGateBusy) return
  authGateBusy = true
  try {
    const { data: assurance, error: assuranceError } = await db.auth.mfa.getAuthenticatorAssuranceLevel()
    if (assuranceError) throw assuranceError

    if (assurance?.nextLevel === 'aal2' && assurance?.currentLevel !== 'aal2') {
      const { data: factors, error: factorsError } = await db.auth.mfa.listFactors()
      if (factorsError) throw factorsError
      const factor = (factors?.totp || []).find(item => item.status === 'verified')
      if (!factor) {
        user = null
        profile = null
        pendingLoginMfa = null
        switchAuthPanel('mfa-login-panel')
        message('mfa-login-message', 'This account requires an authenticator factor that is not available in this browser. Sign out and contact support for account recovery.', true)
        modal('auth-modal')
        return
      }
      const { data: challenge, error: challengeError } = await db.auth.mfa.challenge({ factorId: factor.id })
      if (challengeError) throw challengeError
      pendingLoginMfa = { factorId: factor.id, challengeId: challenge.id }
      $('mfa-login-code').value = ''
      switchAuthPanel('mfa-login-panel')
      message('mfa-login-message', 'Open your authenticator app and enter its current 6-digit code.')
      modal('auth-modal')
      return
    }

    pendingLoginMfa = null
    authGateToken = nextSession.access_token
    session = nextSession
    user = nextSession.user
    await afterAuth()
    modal('auth-modal', false)
  } catch (error) {
    console.error('Authentication verification failed:', error)
    message('auth-message', 'We could not finish secure sign-in. Please try again.', true)
    modal('auth-modal')
  } finally {
    authGateBusy = false
  }
}

if (db) {
  db.auth.onAuthStateChange((event, currentSession) => {
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(() => {
        user = currentSession?.user || null
        switchAuthPanel('reset-form')
        message('reset-message', 'Choose a new password for your account.')
        modal('auth-modal')
      }, 0)
    } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      setTimeout(() => handleAuthSession(currentSession), 0)
    } else if (event === 'SIGNED_OUT') {
      setTimeout(clearSignedInState, 0)
    }
  })
}

let authMode = 'signin'
function setAuthMode(mode) {
  authMode = mode
  const creating = mode === 'signup'
  $('account-name-field').classList.toggle('hidden', !creating)
  $('account-name').required = creating
  $('account-name').autocomplete = 'nickname'
  $('password').autocomplete = creating ? 'new-password' : 'current-password'
  $('auth-submit').textContent = creating ? 'Create account' : 'Sign in'
  $('signup').textContent = creating ? 'Back to sign in' : 'Create account'
  $('forgot-password').classList.toggle('hidden', creating)
  $('auth-title').textContent = creating ? 'Create your Gendev account.' : 'Welcome to Gendev.'
  $('auth-intro').textContent = creating
    ? 'Choose the account name people will see on your public Gendev profile.'
    : 'Sign in to join the community, publish posts, and sync your progress.'
  message('auth-message', '')
}
$('signup').onclick = () => setAuthMode(authMode === 'signup' ? 'signin' : 'signup')

$('auth-form').onsubmit = async event => {
  event.preventDefault()
  if (!db) return message('auth-message', 'Supabase is not configured in Vercel yet.', true)
  const emailInput = $('email')
  const email = emailInput.value.trim()
  const password = $('password').value
  if (!email || !emailInput.checkValidity()) return message('auth-message', 'Enter a valid email address.', true)

  if (authMode === 'signup') {
    const accountName = $('account-name').value.trim()
    if (accountName.length < 3 || accountName.length > 30) {
      return message('auth-message', 'Your account name must be between 3 and 30 characters.', true)
    }
    if (!/[\p{L}\p{N}]/u.test(accountName)) {
      return message('auth-message', 'Your account name must include at least one letter or number.', true)
    }
    const problems = passwordProblems(password)
    if (problems.length) return message('auth-message', 'Use a password with ' + problems.join(', ') + '.', true)

    const button = $('auth-submit')
    button.disabled = true
    message('auth-message', 'Creating your account…')
    try {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { account_name: accountName, display_name: accountName } }
      })
      if (error) return message('auth-message', 'Account creation failed: ' + error.message, true)
      if (data.session) {
        message('auth-message', 'Account created. Finishing secure sign-in…')
      } else {
        message('auth-message', 'Account created. Check your email to confirm your address, then sign in.')
      }
    } catch {
      message('auth-message', 'Account creation failed. Please try again.', true)
    } finally {
      button.disabled = false
    }
    return
  }

  const button = $('auth-submit')
  button.disabled = true
  message('auth-message', 'Signing in securely…')
  try {
    const { error } = await db.auth.signInWithPassword({ email, password })
    if (error) message('auth-message', 'Sign-in failed. Check your email and password, then try again.', true)
  } catch {
    message('auth-message', 'Sign-in failed. Please try again.', true)
  } finally {
    button.disabled = false
  }
}

$('forgot-password').onclick = async () => {
  if (!db) return message('auth-message', 'Supabase is not configured in Vercel yet.', true)
  const email = $('email').value.trim()
  if (!email || !$('email').checkValidity()) return message('auth-message', 'Enter your email address first.', true)
  const button = $('forgot-password')
  button.disabled = true
  message('auth-message', 'Requesting password recovery…')
  try {
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) {
      console.warn('Password recovery request:', error.message)
    }
    message('auth-message', 'If this email is registered, a password-reset link will be sent. Check your inbox.')
  } catch {
    message('auth-message', 'We could not send the reset link right now. Please try again.', true)
  } finally {
    button.disabled = false
  }
}

$('reset-form').onsubmit = async event => {
  event.preventDefault()
  if (!db) return message('reset-message', 'Supabase is not configured.', true)
  const password = $('new-password').value
  const problems = passwordProblems(password)
  if (problems.length) return message('reset-message', 'Use a password with ' + problems.join(', ') + '.', true)
  const button = $('reset-submit')
  button.disabled = true
  message('reset-message', 'Updating your password…')
  try {
    const { error } = await db.auth.updateUser({ password })
    if (error) return message('reset-message', 'Password update failed: ' + error.message, true)
    await db.auth.signOut()
    $('reset-form').reset()
    switchAuthPanel('auth-form')
    message('auth-message', 'Password updated. Sign in with your new password.')
    modal('auth-modal')
  } catch {
    message('reset-message', 'Password update failed. Please request a new reset link.', true)
  } finally {
    button.disabled = false
  }
}

$('mfa-login-form').onsubmit = async event => {
  event.preventDefault()
  if (!db || !pendingLoginMfa) return message('mfa-login-message', 'Start sign-in again to request a new code.', true)
  const code = $('mfa-login-code').value.replace(/\s/g, '')
  if (!/^\d{6}$/.test(code)) return message('mfa-login-message', 'Enter the 6-digit code from your authenticator app.', true)
  const button = $('mfa-login-submit')
  button.disabled = true
  message('mfa-login-message', 'Verifying your authenticator…')
  try {
    const { error } = await db.auth.mfa.verify({
      factorId: pendingLoginMfa.factorId,
      challengeId: pendingLoginMfa.challengeId,
      code
    })
    if (error) return message('mfa-login-message', 'That code could not be verified. Try the newest code from your authenticator.', true)
    pendingLoginMfa = null
    authGateToken = null
    const { data: sessionData, error: sessionError } = await db.auth.getSession()
    if (sessionError || !sessionData.session) throw sessionError || new Error('Session unavailable')
    await handleAuthSession(sessionData.session)
  } catch {
    message('mfa-login-message', 'Two-step verification failed. Please try again.', true)
  } finally {
    button.disabled = false
  }
}
$('mfa-login-cancel').onclick = async () => {
  if (db) await db.auth.signOut()
  pendingLoginMfa = null
  switchAuthPanel('auth-form')
  message('auth-message', 'Sign-in cancelled.')
}

async function renderMfaSettings() {
  const root = $('mfa-settings')
  if (!root) return
  root.replaceChildren()
  const heading = document.createElement('div')
  heading.className = 'mfa-settings-heading'
  heading.textContent = 'ACCOUNT SECURITY'
  root.append(heading)
  if (!user || !db) {
    const note = document.createElement('p')
    note.textContent = 'Sign in to manage two-step verification.'
    root.append(note)
    return
  }
  const { data, error } = await db.auth.mfa.listFactors()
  if (error) {
    const note = document.createElement('p')
    note.textContent = 'Could not load authenticator settings. Please refresh and try again.'
    root.append(note)
    return
  }
  const verified = (data?.totp || []).find(item => item.status === 'verified')
  const status = document.createElement('p')
  status.textContent = verified
    ? 'Authenticator verification is enabled for this account.'
    : 'Add an authenticator app as a second sign-in check.'
  root.append(status)

  if (verified) {
    const remove = document.createElement('button')
    remove.className = 'btn outline'
    remove.textContent = 'Remove authenticator'
    remove.onclick = async () => {
      if (!confirm('Remove two-step verification from this account?')) return
      remove.disabled = true
      const { error: removeError } = await db.auth.mfa.unenroll({ factorId: verified.id })
      if (removeError) {
        message('security-message', 'Could not remove authenticator: ' + removeError.message, true)
      } else {
        await renderMfaSettings()
        message('security-message', 'Authenticator removed. Your account will use password sign-in until you enable it again.')
      }
      remove.disabled = false
    }
    root.append(remove)
  } else {
    const enable = document.createElement('button')
    enable.className = 'btn primary'
    enable.textContent = 'Set up authenticator'
    enable.onclick = () => beginMfaEnrollment(root, enable)
    root.append(enable)
  }
}

async function beginMfaEnrollment(root, button) {
  button.disabled = true
  message('security-message', 'Preparing authenticator setup…')
  try {
    const { data, error } = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Gendev authenticator'
    })
    if (error) throw error

    const setup = document.createElement('div')
    setup.className = 'mfa-enrollment'
    const instructions = document.createElement('p')
    instructions.textContent = 'Scan this QR code with an authenticator app, then enter the current 6-digit code below.'
    const qr = document.createElement('img')
    qr.src = data.totp.qr_code
    qr.alt = 'Authenticator setup QR code'
    qr.className = 'mfa-qr'
    const secretLabel = document.createElement('span')
    secretLabel.textContent = 'Manual setup key'
    const secret = document.createElement('code')
    secret.textContent = data.totp.secret
    secret.className = 'mfa-secret'
    const form = document.createElement('form')
    form.className = 'mfa-verify-form'
    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'numeric'
    input.autocomplete = 'one-time-code'
    input.pattern = '[0-9]{6}'
    input.maxLength = 6
    input.placeholder = '6-digit code'
    input.setAttribute('aria-label', 'Authenticator verification code')
    const verify = document.createElement('button')
    verify.className = 'btn primary'
    verify.textContent = 'Verify and enable'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'btn outline'
    cancel.textContent = 'Cancel'
    const localMessage = document.createElement('p')
    localMessage.className = 'message'
    form.append(input, verify, cancel)
    setup.append(instructions, qr, secretLabel, secret, form, localMessage)
    root.append(setup)

    cancel.onclick = async () => {
      await db.auth.mfa.unenroll({ factorId: data.id })
      setup.remove()
      await renderMfaSettings()
    }
    form.onsubmit = async event => {
      event.preventDefault()
      const code = input.value.replace(/\s/g, '')
      if (!/^\d{6}$/.test(code)) {
        localMessage.textContent = 'Enter the 6-digit code from your authenticator.'
        return
      }
      verify.disabled = true
      try {
        const { data: challenge, error: challengeError } = await db.auth.mfa.challenge({ factorId: data.id })
        if (challengeError) throw challengeError
        const { error: verifyError } = await db.auth.mfa.verify({
          factorId: data.id,
          challengeId: challenge.id,
          code
        })
        if (verifyError) throw verifyError
        setup.remove()
        await renderMfaSettings()
        message('security-message', 'Two-step verification is enabled. Future sign-ins will require your authenticator code.')
      } catch (verifyError) {
        localMessage.textContent = verifyError.message || 'The code could not be verified. Try again.'
      } finally {
        verify.disabled = false
      }
    }
  } catch (error) {
    message('security-message', error.message || 'Could not start authenticator setup.', true)
  } finally {
    button.disabled = false
  }
}


/* Gendev points: claims are reviewed before the database awards points. */
function pointElement(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
async function loadPoints() {
  const missionRoot = $('point-missions')
  if (!missionRoot || !db) {
    if (missionRoot) missionRoot.textContent = 'Points are unavailable because the database is not configured.'
    return
  }
  const { data: missions, error: missionError } = await db.from('point_missions')
    .select('id,title,description,category,points,sort_order')
    .order('sort_order', { ascending: true })
  if (missionError) {
    missionRoot.textContent = 'Could not load missions: ' + missionError.message
    return
  }
  pointMissions = missions || []
  pointClaims = []
  if (user) {
    const { data: claims, error: claimError } = await db.from('point_claims')
      .select('id,mission_id,status,awarded_points,created_at,reviewed_at')
      .order('created_at', { ascending: false })
    if (claimError) console.warn('Could not load point claims:', claimError.message)
    else pointClaims = claims || []
  }
  renderPoints()
}
function openPointMission(missionId) {
  if (!user) {
    setAuthMode('signin')
    modal('auth-modal')
    return
  }
  const mission = pointMissions.find(item => item.id === missionId)
  if (!mission) return
  selectedPointMission = mission
  $('point-submit-title').textContent = mission.title
  $('point-submit-points').textContent = '+' + mission.points + ' Gendev points if approved'
  $('point-proof').value = ''
  $('point-proof-url').value = ''
  message('point-submit-message', '')
  modal('point-submit-modal')
}
function renderPoints() {
  const root = $('point-missions')
  const history = $('points-history')
  if (!root || !history) return
  root.replaceChildren()
  history.replaceChildren()
  const approvedClaims = pointClaims.filter(item => item.status === 'approved')
  const pendingClaims = pointClaims.filter(item => item.status === 'pending')
  const balance = approvedClaims.reduce((sum, item) => sum + (Number(item.awarded_points) || 0), 0)
  $('points-balance').textContent = balance.toLocaleString()
  $('points-approved').textContent = String(approvedClaims.length)
  $('points-pending').textContent = String(pendingClaims.length)
  $('points-login-note').classList.toggle('hidden', !!user)
  $('points-login-note').textContent = user ? '' : 'Sign in to submit missions and keep your points balance saved to your account.'
  if (!pointMissions.length) root.append(pointElement('div', 'empty', 'No missions are available right now.'))
  const latestByMission = new Map()
  for (const claim of pointClaims) if (!latestByMission.has(claim.mission_id)) latestByMission.set(claim.mission_id, claim)
  for (const mission of pointMissions) {
    const claim = latestByMission.get(mission.id)
    const card = pointElement('article', 'mission-card')
    const top = pointElement('div', 'mission-card-top')
    top.append(pointElement('span', 'mission-category', mission.category.toUpperCase()))
    top.append(pointElement('strong', 'mission-points', '+' + mission.points + ' PTS'))
    const title = pointElement('h4', '', mission.title)
    const description = pointElement('p', 'mission-description', mission.description)
    const footer = pointElement('div', 'mission-card-foot')
    if (claim?.status === 'approved') {
      footer.append(pointElement('span', 'mission-status approved', '✓ Earned'))
    } else if (claim?.status === 'pending') {
      footer.append(pointElement('span', 'mission-status pending', 'In review'))
    } else {
      if (claim?.status === 'rejected') footer.append(pointElement('span', 'mission-status rejected', 'Needs another submission'))
      const button = pointElement('button', 'btn outline mission-submit', user ? (claim?.status === 'rejected' ? 'Submit again' : 'Submit proof') : 'Sign in to join')
      button.type = 'button'
      button.onclick = () => openPointMission(mission.id)
      footer.append(button)
    }
    card.append(top, title, description, footer)
    root.append(card)
  }
  if (!user) {
    history.append(pointElement('div', 'empty', 'Sign in to see your points history.'))
  } else if (!pointClaims.length) {
    history.append(pointElement('div', 'empty', 'No mission submissions yet. Pick a mission above to get started.'))
  } else {
    const missionNames = new Map(pointMissions.map(item => [item.id, item.title]))
    for (const claim of pointClaims.slice(0, 12)) {
      const row = pointElement('div', 'point-history-row')
      const info = pointElement('div', 'point-history-info')
      info.append(
        pointElement('strong', '', missionNames.get(claim.mission_id) || 'Gendev mission'),
        pointElement('span', '', new Date(claim.created_at).toLocaleDateString())
      )
      const result = pointElement('div', 'point-history-result')
      const amount = claim.status === 'approved' ? '+' + (Number(claim.awarded_points) || 0) + ' pts' : claim.status === 'pending' ? 'Pending' : 'Try again'
      result.append(pointElement('strong', 'history-' + claim.status, amount))
      row.append(info, result)
      history.append(row)
    }
  }
}
$('point-submit-form').onsubmit = async event => {
  event.preventDefault()
  if (!user || !db || !selectedPointMission) {
    modal('point-submit-modal', false)
    setAuthMode('signin')
    modal('auth-modal')
    return
  }
  const proofText = $('point-proof').value.trim()
  const proofRaw = $('point-proof-url').value.trim()
  const proofUrl = proofRaw ? validUrl(proofRaw) : null
  if (proofText.length < 10) return message('point-submit-message', 'Please add at least 10 characters describing your proof.', true)
  if (proofRaw && !proofUrl) return message('point-submit-message', 'Please enter a valid http or https evidence link.', true)
  const button = $('point-submit-button')
  button.disabled = true
  button.textContent = 'Submitting…'
  try {
    const { data: savedClaim, error } = await db.from('point_claims')
      .insert({
        user_id: user.id,
        mission_id: selectedPointMission.id,
        proof_text: proofText,
        proof_url: proofUrl
      })
      .select('id')
      .single()
    if (error) throw error
    modal('point-submit-modal', false)
    await loadPoints()
    const notification = await db.functions.invoke('notify-points-admin', {
      body: { claimId: savedClaim.id }
    })
    const notificationStatus = $('points-notification-status')
    notificationStatus.classList.remove('hidden')
    if (notification.error || notification.data?.sent !== true) {
      notificationStatus.className = 'points-notification-status error'
      notificationStatus.textContent = 'Your mission was saved, but the email alert could not be sent yet. The administrator can still review it in Supabase.'
    } else {
      notificationStatus.className = 'points-notification-status'
      notificationStatus.textContent = 'Mission submitted! A review notification was emailed to the Gendev administrator.'
    }
  } catch (error) {
    const note = error?.code === '23505'
      ? 'You already have a pending or approved submission for this mission.'
      : (error.message || 'Could not submit this mission. Please try again.')
    message('point-submit-message', note, true)
  } finally {
    button.disabled = false
    button.textContent = 'Send for review'
  }
}


async function afterAuth() {
  if (user) await ensureProfile()
  else profile = null
  accountUI()
  await renderMfaSettings()
  await Promise.all([loadPosts(), loadProgress(), loadPoints()])
  if (!$('players-view').classList.contains('hidden')) loadPlayers()
}
$('signout').onclick = async () => {
  if (!db) return
  const { error } = await db.auth.signOut({ scope: 'global' })
  if (error) return alert('Could not sign out. Please try again.')
}
async function loadProgress() {
  if (!user || !db) return
  const { data, error } = await db.from('parkour_progress')
    .select('current_level,unlocked_level,total_jumps,best_score,coins')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) { message('save-status', error.message, true); return }
  if (data) progress = { ...progress, ...data }
  game.best = Number(progress.best_score) || 0
}
async function saveScore(score, jumps) {
  if (!user || !db) { $('save-status').textContent = 'Sign in to save your score.'; return }
  progress.best_score = Math.max(Number(progress.best_score) || 0, score)
  progress.total_jumps = (Number(progress.total_jumps) || 0) + jumps
  progress.current_level = Math.max(Number(progress.current_level) || 1, Math.floor(score / 100) + 1)
  progress.unlocked_level = Math.max(Number(progress.unlocked_level) || 1, progress.current_level)
  const { error } = await db.from('parkour_progress').upsert({
    user_id: user.id,
    ...progress,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' })
  if (error) $('save-status').textContent = 'Could not save: ' + error.message
  else { $('best').textContent = String(progress.best_score); $('save-status').textContent = 'Record saved ✓' }
}

/* Player search and profile pictures */
function makeAvatar(path, label) {
  const wrap = document.createElement('div')
  wrap.className = 'player-avatar'
  if (path) {
    const image = document.createElement('img')
    image.src = publicMediaUrl(path)
    image.alt = label + ' avatar'
    image.loading = 'lazy'
    wrap.append(image)
  } else {
    wrap.textContent = '☁'
  }
  return wrap
}
function renderOwnProfile() {
  const root = $('own-profile')
  if (!root) return
  root.replaceChildren()
  if (!user || !profile) {
    const note = document.createElement('p')
    note.className = 'muted'
    note.textContent = 'Sign in to create your public runner profile and upload an avatar.'
    const signIn = document.createElement('button')
    signIn.className = 'btn outline'
    signIn.textContent = 'Sign in'
    signIn.onclick = () => modal('auth-modal')
    root.append(note, signIn)
    return
  }
  const row = document.createElement('div')
  row.className = 'own-profile-row'
  row.append(makeAvatar(profile.avatar_path, profile.display_name || profile.username))
  const info = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = profile.display_name || 'Runner'
  const handle = document.createElement('span')
  handle.textContent = '@' + profile.username
  info.append(name, handle)
  const upload = document.createElement('button')
  upload.className = 'btn outline'
  upload.textContent = 'Change avatar'
  upload.onclick = () => $('avatar-file').click()
  row.append(info, upload)
  const roleBox = document.createElement('div')
  roleBox.className = 'profile-role-row'
  const roleLabel = document.createElement('label')
  roleLabel.textContent = 'Community tag'
  const roleSelect = document.createElement('select')
  roleSelect.className = 'search role-select'
  for (const [value, label] of [['community','Community member'],['developer','Developer'],['creator','YouTuber / Creator'],['gamer','Gamer'],['speedrunner','Speedrunner']]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    roleSelect.append(option)
  }
  roleSelect.value = profile.role_tag || 'community'
  const saveRole = document.createElement('button')
  saveRole.className = 'btn outline'
  saveRole.textContent = 'Save tag'
  saveRole.onclick = async () => {
    const { data, error } = await db.from('profiles')
      .update({ role_tag: roleSelect.value })
      .eq('id', user.id)
      .select('id,username,display_name,avatar_path,role_tag,featured_badge')
      .single()
    if (error) return message('player-message', error.message, true)
    profile = data
    accountUI()
    message('player-message', 'Your community tag was updated.')
  }
  roleBox.append(roleLabel, roleSelect, saveRole)
  root.append(row, roleBox)
  if (profile.featured_badge) {
    const special = document.createElement('div')
    special.className = 'featured-badge'
    special.textContent = '✦ ' + profile.featured_badge.toUpperCase()
    root.append(special)
  }
}
$('avatar-file').onchange = async () => {
  const file = $('avatar-file').files?.[0]
  $('avatar-file').value = ''
  if (!user || !db || !file) return
  if (!isAllowedMedia(file, true)) return message('player-message', 'Choose a JPG, PNG, WEBP, or GIF image smaller than 5 MB.', true)
  message('player-message', 'Uploading profile picture…')
  const path = user.id + '/avatar-' + crypto.randomUUID() + '-' + safeFileName(file.name)
  const { error: uploadError } = await db.storage.from('community-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  })
  if (uploadError) return message('player-message', uploadError.message, true)
  const oldPath = profile?.avatar_path
  const { data, error } = await db.from('profiles')
    .update({ avatar_path: path })
    .eq('id', user.id)
    .select('id,username,display_name,avatar_path')
    .single()
  if (error) {
    await db.storage.from('community-media').remove([path])
    return message('player-message', error.message, true)
  }
  profile = data
  if (oldPath) await db.storage.from('community-media').remove([oldPath])
  renderOwnProfile()
  message('player-message', 'Profile picture updated ✓')
  loadPlayers()
}
let playerSearchSequence = 0
async function loadPlayers() {
  const root = $('players')
  if (!root) return
  const raw = $('player-search').value.trim()
  const query = raw.replace(/[^a-zA-Z0-9_ -]/g, '').trim().slice(0, 30)
  if (!query) {
    root.innerHTML = '<div class="empty">Search by a player username or display name.</div>'
    return
  }
  if (!db) { root.textContent = 'Supabase is not configured.'; return }
  if (query.length < 2) { root.textContent = 'Type at least 2 characters.'; return }
  const requestId = ++playerSearchSequence
  root.textContent = 'Searching players…'
  const { data, error } = await db.from('profiles')
    .select('id,username,display_name,avatar_path')
    .or('username.ilike.%' + query + '%,display_name.ilike.%' + query + '%')
    .order('username', { ascending: true })
    .limit(30)
  if (requestId !== playerSearchSequence) return
  if (error) { root.textContent = 'Could not search players: ' + error.message; return }
  root.replaceChildren()
  if (!data?.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No players found. Try another username.'
    root.append(empty)
    return
  }
  for (const player of data) {
    const card = document.createElement('article')
    card.className = 'player-card'
    card.append(makeAvatar(player.avatar_path, player.display_name || player.username))
    const info = document.createElement('div')
    const name = document.createElement('strong')
    name.textContent = player.display_name || 'Runner'
    const handle = document.createElement('span')
    handle.textContent = '@' + player.username
    info.append(name, handle)
    card.append(info)
    if (user && player.id === user.id) {
      const self = document.createElement('span')
      self.className = 'self-tag'
      self.textContent = 'YOU'
      card.append(self)
    }
    root.append(card)
  }
}
$('player-search').oninput = loadPlayers

/* Quick Run: blocks plus hopping storm sprites */
function makeGame() {
  const canvas = $('runner')
  const ctx = canvas.getContext('2d')
  const ground = 295
  let active = false
  let score = 0
  let jumps = 0
  let speed = 5
  let last = 0
  let spawn = 0
  let gameTime = 0
  let items = []
  let raf = 0
  let best = 0
  const player = { x: 100, y: ground - 40, vy: 0, on: true }

  function draw() {
    const gradient = ctx.createLinearGradient(0, 0, 0, 360)
    gradient.addColorStop(0, '#19264b')
    gradient.addColorStop(1, '#3b5788')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 900, 360)
    for (let i = 0; i < 7; i++) {
      const x = (i * 160 - score * .5 % 1050 + 1050) % 1050 - 40
      const y = 70 + i % 3 * 35
      ctx.fillStyle = 'rgba(255,255,255,.15)'
      ctx.beginPath()
      ctx.arc(x, y, 19, 0, 7)
      ctx.arc(x + 24, y - 5, 24, 0, 7)
      ctx.arc(x + 49, y + 5, 17, 0, 7)
      ctx.fill()
    }
    ctx.fillStyle = '#192642'
    ctx.fillRect(0, ground, 900, 65)
    ctx.fillStyle = '#9be6ff'
    ctx.fillRect(0, ground, 900, 4)

    for (const item of items) {
      if (item.kind === 'enemy') {
        ctx.fillStyle = '#a98aff'
        ctx.beginPath()
        ctx.arc(item.x + 17, item.y + 17, 17, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#d8c9ff'
        ctx.beginPath()
        ctx.arc(item.x + 11, item.y + 11, 5, 0, Math.PI * 2)
        ctx.arc(item.x + 24, item.y + 11, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#263052'
        ctx.beginPath()
        ctx.arc(item.x + 12, item.y + 12, 2, 0, Math.PI * 2)
        ctx.arc(item.x + 25, item.y + 12, 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#e1d6ff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(item.x + 10, item.y + 31)
        ctx.lineTo(item.x + 17, item.y + 26)
        ctx.lineTo(item.x + 24, item.y + 31)
        ctx.stroke()
      } else {
        ctx.fillStyle = '#ff8296'
        ctx.beginPath()
        ctx.roundRect(item.x, item.y, item.w, item.h, 7)
        ctx.fill()
        ctx.fillStyle = '#ffc5ce'
        ctx.fillRect(item.x + 6, item.y + 7, item.w - 12, 5)
      }
    }

    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(player.x + 18, player.y + 17, 16, Math.PI, 0)
    ctx.arc(player.x + 35, player.y + 17, 16, Math.PI, 0)
    ctx.lineTo(player.x + 51, player.y + 35)
    ctx.lineTo(player.x + 2, player.y + 35)
    ctx.fill()
    ctx.fillStyle = '#172442'
    ctx.beginPath()
    ctx.arc(player.x + 27, player.y + 16, 2.5, 0, 7)
    ctx.arc(player.x + 38, player.y + 16, 2.5, 0, 7)
    ctx.fill()
    $('score').textContent = String(Math.floor(score))
  }
  function jump() {
    if (active && player.on) {
      player.vy = -13
      player.on = false
      jumps++
    }
  }
  function finish() {
    active = false
    $('run-status').textContent = 'RUN COMPLETE'
    $('overlay-title').textContent = 'Run complete!'
    $('overlay-copy').textContent = 'Score: ' + Math.floor(score) + ' · Jumps: ' + jumps + '. Try again?'
    $('start').textContent = 'Run again'
    $('overlay').classList.remove('hidden')
    best = Math.max(best, Math.floor(score))
    $('best').textContent = String(best)
    saveScore(Math.floor(score), jumps)
  }
  function loop(time) {
    if (!active) return
    const delta = Math.min((time - (last || time)) / 16.67, 2)
    last = time
    gameTime += delta * 16.67
    score += .12 * speed * delta
    speed = Math.min(12, 5 + score / 330)
    player.vy += .62 * delta
    player.y += player.vy * delta
    if (player.y + 40 >= ground) {
      player.y = ground - 40
      player.vy = 0
      player.on = true
    }
    spawn += delta * 16.67
    const spawnDelay = Math.max(610, 1320 - speed * 72)
    if (spawn > spawnDelay) {
      spawn = 0
      const enemyChance = score > 220 ? .56 : score > 75 ? .32 : 0
      if (Math.random() < enemyChance) {
        items.push({ kind: 'enemy', x: 920, y: ground - 34, w: 34, h: 34, phase: Math.random() * 6 })
      } else {
        const height = 28 + Math.random() * 24
        items.push({ kind: 'block', x: 920, y: ground - height, w: 25 + Math.random() * 18, h: height })
      }
    }
    for (const item of items) {
      const movement = item.kind === 'enemy' ? 1.18 : 1
      item.x -= speed * movement * delta
      if (item.kind === 'enemy') item.y = ground - item.h - Math.abs(Math.sin(gameTime * .012 + item.phase)) * 18
    }
    items = items.filter(item => item.x + item.w > 0)
    const hit = items.some(item =>
      player.x + 43 > item.x + 3 &&
      player.x + 7 < item.x + item.w - 3 &&
      player.y + 36 > item.y + 3 &&
      player.y + 4 < item.y + item.h - 2
    )
    draw()
    if (hit) { finish(); return }
    raf = requestAnimationFrame(loop)
  }
  function start() {
    cancelAnimationFrame(raf)
    score = 0
    jumps = 0
    speed = 5
    spawn = 0
    gameTime = 0
    items = []
    player.y = ground - 40
    player.vy = 0
    player.on = true
    active = true
    last = 0
    $('overlay').classList.add('hidden')
    $('run-status').textContent = 'RUNNING'
    raf = requestAnimationFrame(loop)
  }
  $('start').onclick = start
  $('restart').onclick = start
  canvas.onpointerdown = jump
  window.addEventListener('keydown', event => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code) && !$('game-view').classList.contains('hidden')) {
      event.preventDefault()
      jump()
    }
  })
  draw()
  return {
    draw,
    start,
    get best() { return best },
    set best(value) { best = value; $('best').textContent = String(value) }
  }
}
game = makeGame()

/* Gendev live community chat */
const CHAT_CHANNELS = {
  general: 'General',
  developers: 'Developers',
  creators: 'Creators & YouTubers',
  gaming: 'Gaming',
  speedrunning: 'Speedrunning',
  defeats: 'Greatest defeats'
}
function startChat() {
  if (!db) { $('chat-messages').textContent = 'Chat needs the Supabase connection.'; return }
  loadChat()
  if (chatSubscription) return
  chatSubscription = db.channel('gendev-community-chat')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'community_messages' }, payload => {
      if (!payload.new?.channel || payload.new.channel === activeChatChannel) loadChat()
      if (payload.old?.channel === activeChatChannel) loadChat()
    })
    .subscribe()
  chatRefreshTimer = setInterval(loadChat, 12000)
}
function stopChat() {
  if (chatRefreshTimer) clearInterval(chatRefreshTimer)
  chatRefreshTimer = null
  if (chatSubscription && db) db.removeChannel(chatSubscription)
  chatSubscription = null
}
function setChatChannel(channel) {
  if (!Object.prototype.hasOwnProperty.call(CHAT_CHANNELS, channel)) return
  activeChatChannel = channel
  $('chat-channel-title').textContent = CHAT_CHANNELS[channel]
  document.querySelectorAll('[data-chat-channel]').forEach(button => button.classList.toggle('active', button.dataset.chatChannel === channel))
  loadChat()
}
document.querySelectorAll('[data-chat-channel]').forEach(button => {
  button.onclick = () => setChatChannel(button.dataset.chatChannel)
})
async function loadChat() {
  if (!db) return
  const root = $('chat-messages')
  if (!root) return
  const { data, error } = await db.from('community_messages')
    .select('id,user_id,channel,author_name,body,created_at')
    .eq('channel', activeChatChannel)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) { root.textContent = 'Could not load chat: ' + error.message; return }
  const userIds = [...new Set((data || []).map(item => item.user_id))]
  let profilesById = {}
  if (userIds.length) {
    const { data: profileRows } = await db.from('profiles')
      .select('id,username,role_tag,featured_badge')
      .in('id', userIds)
    profilesById = Object.fromEntries((profileRows || []).map(item => [item.id, item]))
  }
  root.replaceChildren()
  if (!data?.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No messages yet. Start the conversation!'
    root.append(empty)
    return
  }
  for (const item of data) {
    const card = document.createElement('article')
    card.className = 'chat-message'
    const heading = document.createElement('div')
    heading.className = 'chat-message-head'
    const author = document.createElement('strong')
    const player = profilesById[item.user_id]
    author.textContent = player?.username || item.author_name || 'Gendev member'
    heading.append(author)
    if (player?.role_tag && player.role_tag !== 'community') {
      const tag = document.createElement('span')
      tag.className = 'role-pill'
      tag.textContent = player.role_tag
      heading.append(tag)
    }
    if (player?.featured_badge) {
      const featured = document.createElement('span')
      featured.className = 'featured-pill'
      featured.textContent = '✦ ' + player.featured_badge
      heading.append(featured)
    }
    const time = document.createElement('time')
    time.textContent = new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    heading.append(time)
    const body = document.createElement('p')
    body.textContent = item.body
    card.append(heading, body)
    const actions = document.createElement('div')
    actions.className = 'chat-actions'
    if (user && user.id === item.user_id) {
      const remove = document.createElement('button')
      remove.textContent = 'Delete'
      remove.onclick = async () => {
        const { error: deleteError } = await db.from('community_messages').delete().eq('id', item.id).eq('user_id', user.id)
        if (deleteError) alert(deleteError.message)
        else loadChat()
      }
      actions.append(remove)
    }
    if (user && user.id !== item.user_id) {
      const report = document.createElement('button')
      report.textContent = 'Report'
      report.onclick = async () => {
        const reason = prompt('Briefly tell the moderators what is wrong with this message.')
        if (!reason || reason.trim().length < 3) return
        const { error: reportError } = await db.from('community_message_reports').insert({
          message_id: item.id,
          reporter_id: user.id,
          reason: reason.trim().slice(0, 500)
        })
        if (reportError) alert(reportError.message)
        else alert('Report sent to the moderation queue.')
      }
      actions.append(report)
    }
    if (actions.childNodes.length) card.append(actions)
    root.append(card)
  }
  root.scrollTop = root.scrollHeight
}
$('chat-form').onsubmit = async event => {
  event.preventDefault()
  if (!user || !db) { setAuthMode('signin'); modal('auth-modal'); return }
  const body = $('chat-input').value.trim()
  if (!body) return
  if (Date.now() - lastChatSend < 2500) return message('chat-status', 'Please wait a moment before sending another message.', true)
  if (body.length > 800) return message('chat-status', 'Messages must be 800 characters or fewer.', true)
  lastChatSend = Date.now()
  const button = $('chat-send')
  button.disabled = true
  const { error } = await db.from('community_messages').insert({
    user_id: user.id,
    channel: activeChatChannel,
    author_name: profile?.username || 'Gendev member',
    body
  })
  button.disabled = false
  if (error) return message('chat-status', error.message, true)
  $('chat-input').value = ''
  message('chat-status', '')
  loadChat()
}

/* Official Speedrun.com public API search (via a small server-side proxy). */
async function loadSpeedrunGames(query) {
  const root = $('speedrun-results')
  if (!root) return
  if (!query.trim()) {
    root.textContent = 'Search for a game to find its Speedrun.com leaderboard.'
    return
  }
  root.textContent = 'Searching Speedrun.com…'
  try {
    const response = await fetch('/api/speedrun-games?q=' + encodeURIComponent(query.trim()))
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Speedrun.com search failed.')
    root.replaceChildren()
    if (!result.games?.length) {
      root.textContent = 'No matching games found.'
      return
    }
    for (const game of result.games) {
      const card = document.createElement('article')
      card.className = 'integration-result'
      const name = document.createElement('strong')
      name.textContent = game.name
      const abbreviation = document.createElement('span')
      abbreviation.textContent = game.abbreviation || 'Speedrun.com game'
      const link = document.createElement('a')
      link.href = game.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.textContent = 'Open leaderboard ↗'
      card.append(name, abbreviation, link)
      root.append(card)
    }
  } catch (error) {
    root.textContent = error.message || 'Could not search Speedrun.com right now.'
  }
}
let speedrunSearchTimer = null
$('speedrun-search').addEventListener('input', () => {
  clearTimeout(speedrunSearchTimer)
  speedrunSearchTimer = setTimeout(() => loadSpeedrunGames($('speedrun-search').value), 450)
})
function setupIntegrations() {
  const discordCard = $('discord-integration')
  const invite = import.meta.env.VITE_DISCORD_INVITE_URL || ''
  const serverId = import.meta.env.VITE_DISCORD_SERVER_ID || ''
  discordCard.replaceChildren()
  const title = document.createElement('h3')
  title.textContent = 'Discord community'
  const text = document.createElement('p')
  if (serverId && /^\d{15,25}$/.test(serverId)) {
    const iframe = document.createElement('iframe')
    iframe.className = 'discord-widget'
    iframe.src = 'https://discord.com/widget?id=' + encodeURIComponent(serverId) + '&theme=dark'
    iframe.title = 'Gendev Discord server widget'
    iframe.loading = 'lazy'
    iframe.allow = 'clipboard-write'
    discordCard.append(title, iframe)
  } else {
    text.textContent = 'Add your Discord server ID in Vercel to show the live server widget.'
    discordCard.append(title, text)
  }
  if (invite && /^https:\/\/(discord\.gg|discord\.com\/invite)\//i.test(invite)) {
    const link = document.createElement('a')
    link.href = invite
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.className = 'integration-link'
    link.textContent = 'Join the Gendev Discord ↗'
    discordCard.append(link)
  } else {
    const note = document.createElement('p')
    note.textContent = 'Set VITE_DISCORD_INVITE_URL after creating or choosing your server.'
    discordCard.append(note)
  }
}
$('speedrun-search-button').onclick = () => loadSpeedrunGames($('speedrun-search').value)
$('donations-learn-more').onclick = () => modal('donation-info-modal')
$('buy-button').onclick = () => modal('donation-info-modal')
