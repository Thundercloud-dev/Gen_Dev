# Speedrunners Online

A Vite + Supabase community site with a browser mini-runner.

## Features

- Email/password accounts through Supabase Auth.
- Community feed for clips and tips.
- Image and short-video attachments using Supabase Storage.
- Public player directory with searchable usernames and display names.
- Profile avatar uploads.
- Quick Run / Cloud Dash game with blocks and hopping storm-sprite enemies.
- Player best-score and progress saves in Supabase.
- A server-side Stripe Checkout endpoint that accepts test-mode keys only.

## Environment variables

Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel for the app.

The Supabase migration in supabase/migrations creates the media bucket, profile fields, and upload policies.

## Upload limits

Community attachments allow JPG, PNG, WEBP, GIF, MP4, and WEBM up to 25 MB. Profile avatars allow image files up to 5 MB. Uploaded community files are public, so only upload material you have permission to share and are comfortable making public.

## Payments: test-only scaffold

The API route /api/create-checkout-session checks the Supabase login on the server and calls Stripe Checkout without exposing a Stripe secret to the browser.

The route rejects any Stripe secret that does not start with sk_test_. Configure STRIPE_SECRET_KEY (test key only) and STRIPE_PRICE_ID as server-side Vercel environment variables only after an adult account owner has reviewed the setup. Do not add live keys. No purchase rewards are granted; verified webhooks and fulfillment would be required before offering paid digital items. Real-money payments are not enabled in this version.

## Local development

    npm install
    npm run dev

Deployments are triggered by pushes to the connected GitHub repository.
