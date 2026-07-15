# Running the AlgoPIN MTurk study locally

This document describes how to bring up the three pieces of the stack — **MongoDB**,
the **API server**, and the **React frontend** — so that a participant walking
through the study end‑to‑end produces a fully populated `telemetrylogs` document
in MongoDB.

Read it once top‑to‑bottom the first time; from then on the **"Daily workflow"**
section is all you need.

---

## 1. Architecture in one diagram

```
                http://localhost:5173                http://localhost:4000
 Browser  ───────────────────────────►   Vite dev   ───►   Express API   ───►   MongoDB
 (React)        (frontend, port 5173)      server         (server/, port 4000)   (Docker, port 27017)
                                                                  │
                                                                  ▼
                                                       db: mturk_pin_study
                                                       collections:
                                                         - participants
                                                         - telemetrylogs
                                                         - predefinedalgorithms
```

Each layer talks to the next one over HTTP/TCP on `localhost`. If any link is
broken, telemetry never reaches Mongo — see the **Troubleshooting** section.

The wire format is:

| Event in the study                | HTTP call                          | Mongo collection         |
| --------------------------------- | ---------------------------------- | ------------------------ |
| Onboarding (mTurkId + base PIN)   | `POST /api/participant/init`       | `participants`           |
| Unlock success on a `*_TEST` page | *(no network — held in store)*     | *(none yet)*             |
| **Submit Ratings** on `*_TLX`     | `POST /api/telemetry`              | `telemetrylogs`          |
| Submit on final SUS survey        | `POST /api/participant/finalize`   | `participants` (updated) |

The intermediate `tempTelemetry` store slot is what bridges the lock screen and
the TLX screen — the actual Mongo write only happens when the participant
clicks **Submit Ratings** on the NASA‑TLX view.

---

## 2. Prerequisites (one‑time, per machine)

| Tool                                    | Why                                     | Verify                            |
| --------------------------------------- | --------------------------------------- | --------------------------------- |
| **Node.js ≥ 18** (LTS recommended)      | Runs Vite + Express                     | `node -v`                         |
| **npm**                                 | Install deps                            | `npm -v`                          |
| **Docker Desktop**                      | Runs MongoDB                            | `docker version`                  |

You do **not** need a local `mongosh` — every Mongo command in this doc is run
inside the container with `docker exec`.

---

## 3. One‑time project setup

From the repo root (`/Users/mohamedatef/mturk-pin-study`):

```bash
# 1. Install frontend deps
npm install

# 2. Install backend deps
cd server && npm install && cd ..

# 3. Create the server's .env (copy and adjust)
cp server/.env.example server/.env
```

### 3.1 Configure `server/.env`

`server/.env.example` ships with:

```env
PORT=4000
MONGODB_URI=mongodb://127.0.0.1:27017/algopin
CORS_ORIGIN=http://localhost:5173
```

> **Important:** the existing dev database in this repo is named
> `mturk_pin_study`, not `algopin`. If you want to keep using the data you
> already have (participants + telemetry logs collected so far), set:
>
> ```env
> MONGODB_URI=mongodb://127.0.0.1:27017/mturk_pin_study
> ```
>
> If you'd rather start fresh, leave it as `algopin` — Mongo will create the
> database the first time the server writes to it.

The three keys mean:

- `PORT` — the API server's port. Must match the frontend's `VITE_API_BASE_URL`
  (defaults to `http://localhost:4000`, see `src/lib/api.ts`).
- `MONGODB_URI` — full connection string, including the database name.
- `CORS_ORIGIN` — the Vite dev URL the API will allow. Must be exactly
  `http://localhost:5173` for local dev.

### 3.2 (Optional) Frontend `.env`

The frontend reads `VITE_API_BASE_URL` from the environment and falls back to
`http://localhost:4000`. You only need a `.env` in the repo root if you point
the frontend at a non‑default API URL:

```env
VITE_API_BASE_URL=http://localhost:4000
```

---

## 4. Daily workflow — start everything

You need **three things running**, in this order. Each lives in its own
terminal tab so you can read the logs.

### Step 1 — MongoDB (Docker)

The container is already created on this machine (named `mongo`, image
`mongo:7`, volume‑backed so data survives restarts). Just start it:

```bash
docker start mongo
```

Verify:

```bash
docker ps --filter name=^mongo$ --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
# NAMES   STATUS         PORTS
# mongo   Up 3 seconds   0.0.0.0:27017->27017/tcp
```

> **First time on a fresh machine?** Create the container instead:
>
> ```bash
> docker run -d --name mongo -p 27017:27017 -v mturk_mongo_data:/data/db mongo:7
> ```
>
> The named volume `mturk_mongo_data` ensures the data outlives the container.

### Step 2 — Seed the algorithms collection (first time only)

The Low / Medium / High algorithm definitions are seeded by a script. Run it
once after the DB is up:

```bash
cd server
npm run seed
# expected: "[seed] upserted low-minute-digit (Low / MINUTE_DIGIT)" ...
#           "[seed] upserted medium-minute-plus-battery (Medium / MINUTE_PLUS_BATTERY)" ...
#           "[seed] upserted high-minute-plus-triple-battery (High / MINUTE_PLUS_TRIPLE_BATTERY)" ...
#           "[seed] done. 3 algorithm(s) ensured."
cd ..
```

The script is idempotent — running it again is harmless.

### Step 3 — Backend (Express API)

```bash
cd server
npm run dev
# expected:
#   [db] connected to mongodb://127.0.0.1/mturk_pin_study
#   [server] listening on http://localhost:4000
```

Leave this terminal open. Test in another shell:

```bash
curl -s http://localhost:4000/api/health
# {"ok":true,"service":"algopin-server"}
```

### Step 4 — Frontend (Vite)

```bash
# from the repo root
npm run dev
# expected:
#   VITE v5.x.x  ready in 238 ms
#   ➜  Local:   http://localhost:5173/
```

Open `http://localhost:5173/` in a browser.

---

## 5. Verifying the pipeline end‑to‑end

Do a full smoke test of one condition to prove all four links are wired:

1. On the onboarding screen, enter an `mTurkId` (e.g. `smoke_test_001`) and a
   4‑digit base PIN. Submit.
2. Walk through the static setup → baseline lock screen → enter the correct
   PIN. You'll briefly see the success animation.
3. The app auto‑routes to the NASA‑TLX page. Move any slider. Click
   **Submit Ratings**.
4. You should see "Submit Ratings" turn into a brief loading state, then the
   app advances to the next algorithm intro screen.

Now confirm everything landed in Mongo:

```bash
docker exec mongo mongosh --quiet --eval \
  'db = db.getSiblingDB("mturk_pin_study");
   print("participants:",  db.participants.countDocuments());
   print("telemetrylogs:", db.telemetrylogs.countDocuments());
   db.telemetrylogs.find({ mTurkId: "smoke_test_001" })
     .sort({ createdAt: -1 })
     .limit(1)
     .pretty();'
```

The last document should include `mTurkId`, `condition: "Baseline"`,
`errorCount`, `returnCount`, `totalAuthTime`, and a full `nasaTlx` block with
six numeric ratings. If it does, your pipeline is healthy.

---

## 6. Querying the data later

### 6.1 Open an interactive shell

```bash
docker exec -it mongo mongosh
```

Inside the shell:

```js
use mturk_pin_study
show collections
db.participants.find().sort({ createdAt: -1 }).limit(5).pretty()
db.telemetrylogs.find({ mTurkId: "YOUR_ID" }).sort({ createdAt: -1 }).pretty()
```

> **Watch out:** `db.telemetry_logs` (with an underscore) does **not** exist.
> Mongoose pluralises the `TelemetryLog` model to **`telemetrylogs`** — one
> word, lowercase. This caught us out before.

### 6.2 One‑shot queries from your normal shell

```bash
# Latest 10 telemetry rows
docker exec mongo mongosh --quiet --eval \
  'db = db.getSiblingDB("mturk_pin_study");
   db.telemetrylogs.find({}, {
     mTurkId: 1, condition: 1, errorCount: 1, returnCount: 1,
     totalAuthTime: 1, "nasaTlx.effort": 1, createdAt: 1
   }).sort({ createdAt: -1 }).limit(10).pretty()'

# All telemetry for one worker
docker exec mongo mongosh --quiet --eval \
  'db = db.getSiblingDB("mturk_pin_study");
   db.telemetrylogs.find({ mTurkId: "YOUR_ID" })
     .sort({ createdAt: 1 }).pretty()'

# Average totalAuthTime per condition
docker exec mongo mongosh --quiet --eval \
  'db = db.getSiblingDB("mturk_pin_study");
   db.telemetrylogs.aggregate([
     { $group: { _id: "$condition", n: { $sum: 1 },
                 avgMs: { $avg: "$totalAuthTime" } } },
     { $sort: { _id: 1 } }
   ]).toArray()'
```

### 6.3 Exporting to JSON

```bash
docker exec mongo mongoexport \
  --db mturk_pin_study \
  --collection telemetrylogs \
  --jsonArray \
  --out /tmp/telemetrylogs.json
docker cp mongo:/tmp/telemetrylogs.json ./telemetrylogs.json
```

---

## 7. Stopping things

```bash
# Frontend / backend: Ctrl+C in their respective terminals
# Mongo (keeps data):
docker stop mongo
```

To completely wipe the local DB (irreversible):

```bash
docker stop mongo
docker rm mongo
docker volume rm mturk_mongo_data    # only if you used the named volume above
```

---

## 8. Troubleshooting

### "I went through the whole study but `telemetrylogs` is empty"

Most common causes, in order of likelihood:

1. **Looking at the wrong collection.** It's `telemetrylogs` (no underscore),
   not `telemetry_logs`. See §6.1.
2. **Looking at the wrong database.** Run `show dbs` inside `mongosh` and
   confirm your `MONGODB_URI` and the DB you're querying match.
3. **The NASA‑TLX `Submit Ratings` button was never clicked.** The Mongo
   write only happens at TLX submission, not at unlock success.
   The browser console line `[LockScreenTelemetry] {...}` is just a
   local‑only spot‑check log written by the lock‑screen hook to
   `localStorage` — it does **not** mean anything was POSTed.
4. **The TLX submit POST failed.** Open browser DevTools → Network, repeat the
   submission, look for `POST /api/telemetry`. A red `400`/`500` means the
   server rejected it (read the JSON body for the reason). A failed/cancelled
   request means CORS or the API isn't reachable — check the server logs.

### "Server fails to start with `MONGODB_URI is not set`"

You don't have a `server/.env`. Run `cp server/.env.example server/.env` and
adjust it (see §3.1).

### "Server fails to start with `MongooseServerSelectionError`"

MongoDB isn't running or isn't reachable on `127.0.0.1:27017`.

```bash
docker ps --filter name=^mongo$         # is the container up?
docker logs --tail 50 mongo             # any startup error?
docker start mongo                      # start it
```

### "Browser console shows a CORS error from `localhost:4000`"

`CORS_ORIGIN` in `server/.env` must exactly match the URL you're loading the
frontend from (`http://localhost:5173` for plain `npm run dev`). Fix it, then
restart the server.

### "I get `Bind for 0.0.0.0:27017 failed: port is already allocated`"

Another Mongo instance is already bound to 27017. Either:

```bash
docker ps --filter publish=27017    # find who owns the port
docker stop <that-container>
```

or pick a different host port when starting Mongo
(`-p 27018:27017`) and update `MONGODB_URI` accordingly.

### "`db.getCollectionNames()` returns `[]`"

You connected to the wrong database. Inside `mongosh` run `use mturk_pin_study`
(or whatever DB your `MONGODB_URI` points to) before listing collections.

---

## 9. Quick reference

```bash
# Start everything
docker start mongo
( cd server && npm run dev )    # terminal 1
npm run dev                     # terminal 2 (repo root)

# Health check
curl -s http://localhost:4000/api/health

# Peek at the latest telemetry write
docker exec mongo mongosh --quiet --eval \
  'db = db.getSiblingDB("mturk_pin_study");
   db.telemetrylogs.find().sort({ createdAt: -1 }).limit(1).pretty()'

# Stop everything (keeps data)
# Ctrl+C in both dev servers
docker stop mongo
```
