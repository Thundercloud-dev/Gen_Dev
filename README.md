# Speedrunners Online

A community website for sharing speedrunning clips and tips, with a small playable Quick Run mini-game.

## Features

- Email/password sign-up, sign-in, and sign-out with Supabase Auth
- Public community feed for clips and tips
- Create and delete your own posts
- Optional external clip/reference links
- Search and filter the feed
- Quick Run browser mini-game with account-saved best score
- Guest browsing and guest gameplay

## Stack

- Vite
- Vanilla JavaScript
- Supabase JS client
- Supabase Postgres with Row Level Security

## Vercel environment variables

Set these for Production, Preview, and Development:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use only the Supabase publishable key in browser code. Never expose a service-role or secret key.

## Local development

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add your Supabase URL and publishable key.
4. Run `npm run dev`.
5. Run `npm run build` to check the production build.

## Database

The app uses the existing `public.parkour_progress` table to save Quick Run scores. It adds `public.community_posts` for the community feed. Row Level Security makes posts public to read, while only signed-in authors can create, update, or delete their own posts.

The migration is in `supabase/migrations/202610290001_create_community_posts.sql`.

## Payments later

Payments are intentionally not enabled in this starter. They can be added later with a trusted server-side checkout flow (for example, Stripe Checkout through a Vercel server function) and verified webhooks. Payment secrets must stay server-side and must never be placed in frontend environment variables.

## Not included yet

Direct video uploads, comments, likes, moderation tools, multiplayer matchmaking, and payment processing are future features.
