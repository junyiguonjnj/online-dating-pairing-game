# Online Dating Pairing Game · Multiplayer v0.2

**A live, anonymous classroom activity about the matching phenomenon.** Independently developed as a digital teaching adaptation inspired by Ellis & Kelley (1999).

## What works now

- Teacher creates a temporary room with a six-character join code and 4–40 fictional roles.
- Each student joins from their own phone or laptop and receives an anonymous fictional role.
- Students can browse *others'* simulated scores while their own score remains hidden until the final reveal.
- Students send matching requests; recipients can accept or reject them. An accepted match removes both roles from the available pool.
- Teacher advances rounds, reveals scores and results, sees a score scatterplot, and exports a CSV without student names.
- Changes appear live across devices via server-sent events (SSE), with polling as a fallback.
- No student accounts, actual profile photos, real dating behavior, or personal rating information are collected.
- Built with Node.js built-in APIs and vanilla HTML/CSS/JS; **no npm packages** are required.

**Do not describe this as a validated measurement of attraction.** Scores are fictional. An individual classroom run may or may not produce assortative matching. This is an instructional simulation, not human-subjects research.

## Run locally

Node.js 20+ is required.

```bash
npm start
```

Open `http://localhost:3000` in a browser. For students on separate devices on the same Wi-Fi, run on a network-accessible host and share its LAN IP and port. Some campus networks block device-to-device connections; a public HTTPS deployment is usually easier.

Run automated tests:

```bash
npm test
```

## Deploy publicly with GitHub + Render

**GitHub Pages alone cannot host multiplayer sessions** because this version needs a Node.js backend. GitHub can host the source code; Render can host the running application.

1. Create a new GitHub repository (for example `online-dating-pairing-game`) and upload the contents of this folder.
2. At [dashboard.render.com](https://dashboard.render.com/), create a **New → Web Service**. Connect the repository or choose the included `render.yaml` blueprint if available.
3. Runtime: **Node**. Build command: `npm install`; start command: `npm start`. The application reads Render's `PORT` automatically. Health endpoint: `/health`.
4. Choose a suitable hosting plan. Wait for deployment, then open the actual HTTPS URL supplied by Render. The live classroom is created on that URL.
5. Before using the tool with students, run a trial with two or more devices. Do not publish a room's private instructor token.

**Important free-plan limitation:** Free instances can sleep during inactivity, and the application stores all room state *only in server memory*. If the service restarts, crashes, spins down, or is redeployed, **all current rooms and results are lost**. Do not rely on this version for high-stakes assessments or permanent classroom records. For reliable production use, add durable storage and robust authentication. Current deployment is intended for supervised, small-classroom pilots.

## Classroom safety and accessibility

- All participant roles, profile labels, and ratings are fictional; no one rates actual students.
- Students do not need to download a dating app. Participation should be optional; offer an observer/analyst alternative.
- Share only the six-character room code, **never the teacher's hidden access token**. Tokens remain in the current browser tab's `sessionStorage` for refresh recovery.
- Room access relies on tokens and an unguessable invitation code; it is suitable for low-risk classroom trials, not for confidential student information.
- Results are anonymous by design but may still reflect in-class interactions. Avoid posting identifiable attendance mappings or student-level outcomes publicly.
- Ensure campus accessibility and privacy policies are met before deployment.

## Software design and limitations

- Single Node.js process, in-memory rooms, temporary sessions (maximum 6 hours).
- No database, analytics, user tracking, user names, or registration.
- SSE push events inform clients to refresh their state; action validation always occurs on the server.
- Room sessions do not survive server restarts and cannot be shared across multiple server replicas.
- Basic static content security policy and server-side permissions are provided; this has **not** undergone a professional security or accessibility audit.

## Attribution

Ellis, B. J., & Kelley, H. H. (1999). The pairing game: A classroom demonstration of the matching phenomenon. *Teaching of Psychology, 26*(2), 118–121.

This project is original code and an independent teaching adaptation inspired by the published activity. It is not affiliated with any dating platform. Source code is MIT licensed; research materials from the original article are not relicensed here.

## Publishing with an academic chapter


