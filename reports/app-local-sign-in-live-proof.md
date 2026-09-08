# Live proof: free self-hosted sign-in (2026-09-06)

Run against a real server, not tests. Server: t3rooms `2ecba24` with `ROOMS_HUMAN_AUTH_PROVIDER=local`
on a throwaway Postgres. Client: this repo at `449897992`, web dev build. Evidence, harness, and
`results.json`: `/Users/monroe/Documents/Codex/2026-09-04/thi/outputs/live-proof-2026-09-06/`.

## What happened

1. **Host** (Browser pane) added the server URL; the client discovered `provider: local`,
   `setup_required: true`, and showed the set-up form. Redeemed the operator-issued setup token
   with username, password, display name. Landed on "Create your first room".
2. Created **Splats**; landed in `#general` as admin; sent a message.
3. On the dashboard, created an operator **invite** using the local session as bearer.
4. **Friend** (separate Chromium profile) added the same server URL, chose "Join with invitation",
   entered room ID + invite + username/password/display name. One request (`201`) created the
   account, the membership, and the session. Landed on the Splats dashboard as operator.
5. Friend signed in again on a **fresh profile** with username and password only; replied in
   `#general`. The reply appeared on the host via the existing long-poll, attributed to Ben.
6. **Restarted Rails** by PID. Host reload: still signed in, both messages present. Friend reload:
   same.
7. Friend **signed out** on the dashboard. The stored session was cleared client-side; the old
   token returned `401` at `/rooms/human/v1/session` (it was `200` a moment earlier).
8. Wrong password: "username or password is incorrect". Correct password: back in, history intact.
9. **Stranger**: no bearer `401`; forged bearer `401`; fresh device joining with a bogus invite:
   "invitation is unavailable", no account created.

## Not covered by this run

- The Electron desktop transport. The browser page cannot call Rails cross-origin, so the proof
  ran behind a single-origin loopback proxy (`harness/origin-proxy.mjs`). Desktop does not need it.
- Screenshot attachments in the channel: the composer has no attachment UI yet.
- Mobile, plain-HTTP LAN origins, and the password-reset UI (server path is covered by Rails tests).

## Paper cuts noticed

- After enrollment or sign-in the friend lands on the room dashboard, not the channel.
- The dashboard's invite and sign-out controls sit inside the collapsed "Room admin and
  membership" section; a first-time host has to know to open it.
