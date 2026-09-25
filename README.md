# Robby — Sewer Squad

Customer-facing Robby chatbot + owner dashboard for [Sewer Squad](https://www.sewersquad.ca/).

Same look & interaction pattern as the Ginny / Dooogs site, rebuilt for plumbing lead capture.

## Version 1 flow

1. Customer opens the site → Robby: “Hi, how can we help?”
2. Knows services, pricing ($88 clear + camera, etc.), hours (24/7), GTA areas, FAQs
3. Detects intent: emergency / quote / booking / question
4. Collects name + phone or email
5. Asks 2–4 qualification questions
6. Offers callback or appointment window
7. Saves the lead (local + optional webhook)
8. **Dashboard:** Conversations → Leads → Qualified → Bookings → Estimated pipeline $

## Run locally

```bash
cd website
npm install
npm run dev
```

- Chat: http://localhost:3000/en  
- Dashboard: http://localhost:3000/en/dashboard  

## Assets

- 3D Robby model: `public/assets/ava/character/ava.glb` (from Meshy Confident Grace)

## Business facts

Pulled from sewersquad.ca — phone **647-699-2212**, Ajax + Hamilton shops, GTA service areas, no after-hours fees.
