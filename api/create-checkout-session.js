export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const authHeader = req.headers.authorization || ''
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!authHeader.startsWith('Bearer ') || !supabaseUrl || !publishableKey) {
    return res.status(401).json({ error: 'Sign in before starting checkout.' })
  }

  try {
    const authResponse = await fetch(supabaseUrl + '/auth/v1/user', {
      headers: { apikey: publishableKey, Authorization: authHeader }
    })
    if (!authResponse.ok) return res.status(401).json({ error: 'Your sign-in session is invalid. Please sign in again.' })
    const account = await authResponse.json()

    const stripeSecret = process.env.STRIPE_SECRET_KEY || ''
    const priceId = process.env.STRIPE_PRICE_ID || ''
    // This project deliberately rejects live keys. Only Stripe test mode is accepted.
    if (!stripeSecret.startsWith('sk_test_') || !priceId.startsWith('price_')) {
      return res.status(503).json({ error: 'Test checkout is not configured yet. Live payments are disabled.' })
    }

    const host = req.headers.host || ''
    let siteOrigin = 'https://' + host
    if (req.headers.origin) {
      const requestOrigin = new URL(req.headers.origin)
      if (requestOrigin.host !== host) return res.status(403).json({ error: 'Origin check failed.' })
      siteOrigin = requestOrigin.origin
    }

    const form = new URLSearchParams()
    form.set('mode', 'payment')
    form.set('line_items[0][price]', priceId)
    form.set('line_items[0][quantity]', '1')
    form.set('success_url', siteOrigin + '/?payment=success')
    form.set('cancel_url', siteOrigin + '/?payment=cancel')
    form.set('client_reference_id', account.id)
    form.set('metadata[user_id]', account.id)

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + stripeSecret,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form
    })
    const checkout = await stripeResponse.json()
    if (!stripeResponse.ok || !checkout.url) {
      return res.status(502).json({ error: 'Stripe could not create a test checkout session.' })
    }
    return res.status(200).json({ url: checkout.url })
  } catch (error) {
    return res.status(500).json({ error: 'Checkout could not be started.' })
  }
}