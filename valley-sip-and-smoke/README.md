# Valley Sip and Smoke

Production-ready Next.js app for the Valley Sip and Smoke bourbon + cigar nights hosted at On Cue Sports Bar & Grill (Front Royal, VA).

## Setup

```bash
cd valley-sip-and-smoke
npm install
```

Create a `.env` file (or update `.env.local`) with:

```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-random-secret"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="owner@example.com"
MEMBER_PASSCODE="member-passcode"
ADMIN_PASSCODE="admin-passcode"
```

Optional Stripe configuration:

```
STRIPE_SECRET_KEY="sk_live_or_test"
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_MEMBER="price_..."
STRIPE_PRICE_ID_LOCKER="price_..."
```

## Database

```bash
npm run db:push
npm run db:seed
```

The seed script creates:
- Membership plans (Member, Locker Member)
- Next 8 Thursday + next 8 Sunday event nights
- Sample bottles and a published reserve week
- Admin user (if `ADMIN_EMAIL` is set)

## Run locally

```bash
npm run dev
```

## Deploy notes

- Use Postgres in production by switching `DATABASE_URL` and updating `prisma/schema.prisma` provider.
- Set `NEXTAUTH_URL` to your deployed URL.
- Set Stripe webhook endpoint to `/api/stripe/webhook`.
- Admin users are granted by matching `ADMIN_EMAIL`.

## Testing the flows

- Visit `/join` to start membership.
- Use `/signin` with the passcode to access member pages.
- Admin pages live at `/admin/*` and require the admin passcode/email.
- Host check-in is `/admin/checkin`.
