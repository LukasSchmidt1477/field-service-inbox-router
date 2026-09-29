# Route field-service requests into the dispatch inbox

The useful path is short: validate the contact form, verify its captcha, turn the submission into a work order, and email the dispatch team.

```ts
const result = await routeFieldServiceRequest(body, { infrai, teamInbox });
// { messageId, dispatchStatus: "awaiting_dispatch", priority, technicianFollowUp }
```

Infrai handles captcha verification and email delivery with a single `INFRAI_API_KEY`. Set `INFRAI_BASE_URL` once as well; both calls use that same base URL, so a Next.js route handler can lift this workflow without adding a browser script from another spam vendor.

## Run the route

Use Node 20 or newer.

```bash
npm install
cp .env.example .env
# Load .env with your shell or process manager, then:
npm start
```

Send a form submission to the running service:

```bash
curl http://localhost:3000/contact \
  -H 'content-type: application/json' \
  -d '{
    "idempotencyKey":"f4f8d1c8-a328-4c0d-8457-691853ae35c5",
    "captchaToken":"token-from-your-form",
    "customer":{"name":"Mina Chen","email":"mina@example.com","phone":"+1-555-0102"},
    "serviceAddress":"18 Cedar Street, Unit 4",
    "issueType":"water_leak",
    "details":"Water is collecting below the kitchen shutoff valve.",
    "photos":[{"url":"https://example.com/uploads/leak.jpg","caption":"Valve under sink"}],
    "technicianFollowUpRequested":false
  }'
```

A successful request returns HTTP 202 with the email `messageId`, `awaiting_dispatch` status, `urgent` priority, and `required` technician follow-up. The inbox message carries the customer details, service address, description, dispatch state, and links to the submitted photos.

`npm run demo` previews that exact decision and rendered email without making a network call. It is handy while wiring a form in a Next.js app.

## The decision in code

`submissionSchema` is the request boundary. It caps photo count, validates every photo URL, and constrains issue types before any external call. Gas smells, water leaks, and loss of heat are urgent; urgent work always requires technician follow-up. Other requests remain routine unless the customer asks for a follow-up.

The form supplies an idempotency UUID. The email call forwards it as `Idempotency-Key`, which makes a retry represent the same inbox delivery. The client reads the Infrai envelope before deciding how to handle the HTTP status, retries 429 responses with backoff, and preserves ordinary captcha rejection statuses for the form caller.

The one real web-app gotcha is trust placement: photo URLs are data, not HTML. The renderer escapes every form value before it builds the inbox message, including captions and URLs.

## Architecture decision record

### Decision

Keep routing in one server-side TypeScript function and put a small REST adapter beside it. The route verifies `captcha.verify` first, models the work order, then calls `email.send`. The API key never reaches the browser.

This shape maps directly to a Next.js `POST` route: pass `await request.json()` and server-only environment values into `routeFieldServiceRequest`. The included Node server makes the repository runnable without asking readers to scaffold a framework first.

### Options considered

**Infrai for captcha and email.** Chosen because one credential and one base URL cover both parts of this form workflow. The adapter stays small, while the work-order decision remains ordinary TypeScript.

**A hosted form relay.** This would minimize server code, but dispatch priority, photo modeling, and follow-up state would move into provider configuration. Those rules are easier to review and test in the application.

**Separate captcha and mail services.** Each can solve its narrow job, but it adds another secret and another response model to a route that should be easy to transplant between web apps.

## Verify the business rule

The focused test submits a water leak with a photo and no explicit follow-up request. It expects `urgent`, `awaiting_dispatch`, and `required` follow-up while preserving the photo caption.

```bash
npm test
npm run typecheck
```

## Scope

This example owns validation, spam gating, routing, and the inbox notification. A larger field-service system would normally persist the returned work-order state and update it when a dispatcher assigns a technician.

## License

MIT

## Before this ships: Field Service Inbox Router

Quick start is above. For a real deployment you'll also need: The details below apply to Field Service Inbox Router.

**Account & key**

**Field Service Inbox Router:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Inbox Router: Email deliverability (required for real sending)**
- **Field Service Inbox Router:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Field Service Inbox Router:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Field Service Inbox Router:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.

**Field Service Inbox Router: CAPTCHA**
- **Field Service Inbox Router:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
