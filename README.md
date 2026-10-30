# Gendev

Gendev is a community hub for developers, video creators, gamers, speedrunners, and other creative communities.

## Current features

- Supabase email/password accounts.
- Public community feed for clips, tips, and project links.
- Image and short-video attachments, plus profile avatars.
- Searchable public player directory and self-selected community tags.
- Featured badges reserved for moderators / site administrators.
- Public topic chat: General, Developers, Creators, Gaming, Speedrunning, and Greatest Defeats.
- Message reporting and author-only message deletion.
- Speedrun.com game search through the official read-only API.
- Optional Discord widget and invite link, configured through Vercel environment variables.
- Quick Run mini-game and saved player scores.

## Environment variables

Client-safe values:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_DISCORD_INVITE_URL` (optional; your own invite URL)
- `VITE_DISCORD_SERVER_ID` (optional; your Discord server ID)

Do not put secret keys in variables prefixed with `VITE_`.

## Creator donations

Creator donations are planned through Stripe Connect, not a single-store checkout. Payment processing and payouts are not enabled. A Stripe Connect marketplace configuration, verified onboarding, webhook-based payment confirmation, refund/dispute handling, and creator payout setup must be reviewed before launch. An adult legal guardian must own and review the Stripe account before an under-18 account can accept charges or receive transfers. Do not add live Stripe keys to the current app.

## Speedrun.com

Game discovery uses the official Speedrun.com API at `https://www.speedrun.com/api/v1`. Gendev links back to the source leaderboard and is not endorsed by Speedrun.com. Do not scrape the Speedrun.com website.

## Local development

```bash
npm install
npm run dev
```
