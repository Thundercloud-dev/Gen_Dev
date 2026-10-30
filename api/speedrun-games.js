export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const query = String(req.query.q || '').trim().slice(0, 80)
  if (query.length < 2) return res.status(200).json({ games: [] })

  try {
    const url = new URL('https://www.speedrun.com/api/v1/games')
    url.searchParams.set('name', query)
    url.searchParams.set('max', '12')
    url.searchParams.set('orderby', 'similarity')

    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GendevCommunity/1.0'
      }
    })

    if (!upstream.ok) {
      res.setHeader('Cache-Control', 'no-store')
      return res.status(upstream.status === 429 ? 503 : 502).json({
        error: upstream.status === 429
          ? 'Speedrun.com is rate-limiting searches. Try again in a little while.'
          : 'Speedrun.com could not complete the search.'
      })
    }

    const payload = await upstream.json()
    const games = (payload.data || []).map(game => ({
      id: game.id,
      name: game.names?.international || game.abbreviation || 'Game',
      abbreviation: game.abbreviation || '',
      url: game.weblink || 'https://www.speedrun.com/'
    }))

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    return res.status(200).json({ games })
  } catch {
    return res.status(502).json({ error: 'Could not reach the Speedrun.com API.' })
  }
}