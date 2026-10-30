# Gendev

Gendev is a community hub for developers, video creators, gamers, speedrunners, and other creative communities.

## Current features

- Supabase email/password accounts using the PKCE browser flow.
- Authenticator-app TOTP enrollment and sign-in challenge for accounts that opt in.
- Database-enforced MFA assurance checks for enrolled accounts across profiles, posts, chat, reports, levels, progress, and leaderboard data.
- Password recovery by email and 12-character mixed-character password checks in the Gendev forms.
- Public community feed for clips, tips, and project links.
- Image and short-video attachments, plus profile avatars.
- Searchable public player directory and self-selected community tags.
- Featured badges reserved for moderators / site administrators.
- Public topic chat: General, Developers, Creators, Gaming, Speedrunning, and Greatest Defeats.
- Message reporting and author-only message deletion.
- Speedrun.com game search through the official read-only API.
- Optional Discord widget and invite link, configured through Vercel environment variables.
- Quick Run mini-game and saved player scores.
- Gendev Points missions for social follows, Quick Run achievements, and community contributions.
- Points claims are stored per account and require administrator review before points are awarded; rejected claims can be resubmitted.

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

## Account security notes

Gendev uses Supabase Auth for password handling; passwords are never stored by Gendev's application code. Authenticator-based MFA is optional per account, but once an account enrolls a verified authenticator, the database requires an AAL2 session for authenticated access to the protected community tables. Users should keep access to their authenticator and their verified email address.

Two provider-side protections still need to be enabled in the Supabase Auth dashboard: enforce the same minimum password length and required character classes at the Auth service itself, and enable leaked-password protection where the project's plan supports it. CAPTCHA also requires a provider site key and secret; it is not enabled until those credentials are configured. The Supabase security advisor currently reports leaked-password protection as disabled. Client-side password checks are an extra layer, not a substitute for server-side Auth settings.


## Gendev Points

The Points page lists active missions and the points associated with each one. Users submit a short explanation and an optional evidence link. Claims are private to the submitting account and begin in the `pending` state. Users cannot approve claims, edit their point balance, or choose an award amount. The database award trigger copies the amount from the mission catalog only when an administrator changes a claim to `approved`.

Administrators should review proof before approval in Supabase. To inspect pending claims:

```sql
select c.id, p.display_name, p.username, m.title, c.proof_text, c.proof_url, c.created_at
from public.point_claims c
join public.point_missions m on m.id = c.mission_id
left join public.profiles p on p.id = c.user_id
where c.status = 'pending'
order by c.created_at asc;
```

To approve one verified claim:

```sql
update public.point_claims
set status = 'approved'
where id = '<claim uuid>' and status = 'pending';
```

The database trigger fills in the configured mission points. Points currently have no cash value and cannot be redeemed, transferred, or exchanged. Gift cards and other prizes are future ideas only; no redemption or payment flow is enabled.
