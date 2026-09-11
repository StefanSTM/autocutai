# ZaKo AutoCut Monetization Plan

This is a practical roadmap for turning the plugin into a paid product.

## Product model

Best starting model:

- Free trial: 7 days or 20 processed clips.
- One-time license: simple, easier for editors to understand.
- Later: subscription for updates, cloud features, preset packs, and priority support.

## Licensing architecture

Do not rely only on hiding code in the CEP panel. JavaScript panels are easy to inspect.

Use this structure:

```text
Premiere panel
  -> local worker
  -> your license server
  -> payment provider webhook updates license status
```

The panel should unlock buttons only after the worker validates the license.
The worker should cache the last successful license check for limited offline use.

## Activation flow

1. User buys license.
2. Payment provider creates a license key.
3. User enters key inside ZaKo AutoCut.
4. Worker sends key + machine fingerprint to your license server.
5. Server returns active/inactive + allowed machine count.
6. Plugin saves an activation token locally.
7. Every few days the worker revalidates the key.

## Anti-sharing basics

- Device limit: usually 1–2 active machines.
- Activation/deactivation portal.
- Rate-limit activation attempts.
- Signed license response from your server.
- Short offline grace period, for example 7–14 days.
- Keep licensing checks in the worker/native layer, not only panel JavaScript.

## Important truth

No desktop plugin is impossible to crack. Your goal is not perfect DRM; your goal is to stop casual sharing and make buying easier than pirating.

## Suggested stack

Simplest route:

- Lemon Squeezy for checkout + license keys.
- License API for activate/validate/deactivate.
- Optional backend later if you want custom device limits.

More custom route:

- Stripe Checkout/Subscriptions.
- Your own backend: Node/Fastify or Next.js.
- Database: Supabase/Postgres.
- Webhooks update license/subscription status.

## Files you would add later

```text
worker/services/licenseClient.js
worker/routes/license.js
com.zako.autocutai/license.html or License tab
```

## License states

```json
{
  "licenseKey": "XXXX-XXXX",
  "status": "active",
  "plan": "pro",
  "expiresAt": "2026-12-31T00:00:00Z",
  "machineLimit": 2,
  "offlineUntil": "2026-06-15T00:00:00Z"
}
```
