# akisSp — Architecture SMPP & Strategie de deploiement

## 1. Analyse de l'architecture actuelle

### Ce qui fonctionne en local

L'application Next.js 15 (App Router) tourne en un **seul processus Node.js persistant** qui heberge simultanement :

1. **Le frontend** (React Server Components + Client Components).
2. **Le backend** (Server Actions, Route Handlers sous `app/api/`).
3. **Un client SMPP persistant** (`core/lib/smpp/client.ts`) — une connexion TCP longue duree (bind transceiver SMPP 3.4) vers le SMSC local, maintenue vivante par des `enquire_link` toutes les 30 s. Le `SmppSessionManager` est un singleton `globalThis` qui survit aux hot-reloads.
4. **Des workers BullMQ** (`sms-queue`, `campaign-queue`, `webhooks-queue`) qui tournent **dans le meme processus**, connectes a Redis via ioredis (TCP persistant).
5. **Un gestionnaire de shutdown** (`core/lib/shutdown.ts` + `instrumentation.ts`) qui unbind proprement la session SMPP, ferme les workers et Redis sur SIGTERM/SIGINT.

Le SMSC (`SMPP_HOST`) est sur le **reseau local** (IP privee ou localhost). Le processus Node.js y accede directement en TCP. Redis est soit local soit Upstash. PostgreSQL est heberge sur Supabase (accessible via Internet).

```
[ Navigateur ]
      |  HTTPS
      v
[ Next.js (un seul processus Node.js) ]
      |           |            |
      |           |            +---> [ PostgreSQL / Supabase ]  (Internet)
      |           |
      |           +---> [ Redis ]  (local ou Upstash)
      |
      +---> TCP bind_transceiver ---> [ SMSC ]  (reseau local, IP privee)
```

### Composants critiques lies au SMPP

| Fichier | Role | Contrainte |
|---------|------|------------|
| `core/lib/smpp/client.ts` | Connexion TCP persistante, enquire_link, reconnect auto | Necessite une socket TCP longue duree vers le SMSC |
| `core/lib/smpp/session-manager.ts` | Singleton `globalThis`, une session par process | Assume un seul processus Node.js persistant |
| `core/lib/smpp/send-sms.ts` | submit_sm avec rate limiting, retry, validation E.164 | Depend du client SMPP bind |
| `core/lib/smpp/wire-delivery-receipts.ts` | Ecoute les `deliver_sm` (DLR + MO) | Necessite une session transceiver active en permanence |
| `core/lib/smpp/rate-limiter.ts` | Token bucket en memoire (100 msg/s) | Etat in-process, perdu si le process meurt |
| `core/lib/queue/sms-queue.ts` | BullMQ worker — enqueue/dequeue/retry/DLQ | Worker demarre au chargement du module, tourne en boucle |
| `instrumentation.ts` | Enregistre les handlers SIGTERM/SIGINT | Necessite un process avec un cycle de vie controlable |

---

## 2. Limitations du deploiement sur Vercel

### 2.1. Les fonctions serverless ne peuvent pas maintenir une connexion TCP persistante

Vercel execute le code serveur Next.js dans des **fonctions serverless** (AWS Lambda). Chaque requete HTTP obtient une instance ephemere qui :
- **Demarre a froid** (cold start) a chaque invocation (ou est recyclee depuis un pool chaud pendant quelques minutes).
- **Est tuee** des que la reponse HTTP est envoyee (pas de processus persistant).
- **N'a pas de filesystem persistant** ni de `globalThis` fiable entre deux requetes.

Le protocole SMPP exige une **connexion TCP longue duree** (bind → enquire_link toutes les 30-70 s → unbind). On ne peut pas bind/unbind a chaque requete HTTP : le bind prend 1-5 s, le SMSC a un nombre limite de connexions simultanees (2 dans la config actuelle), et les DLR (`deliver_sm`) arrivent de facon asynchrone sur la session liee — pas sur une requete HTTP.

**Conclusion : le client SMPP ne peut pas tourner dans une fonction Vercel.**

### 2.2. BullMQ ne fonctionne pas en serverless

BullMQ utilise un `Worker` qui boucle en permanence sur `BRPOPLPUSH` Redis. Ce pattern (long-polling infini sur Redis) est incompatible avec le modele request/response des fonctions serverless :
- Le worker doit etre un process persistant.
- `ioredis` a besoin d'une socket TCP persistante vers Redis (pas le REST API d'Upstash).

### 2.3. Le reseau prive est inatteignable depuis Vercel

Les fonctions Vercel s'executent dans des datacenters AWS (us-east-1, etc.). Elles n'ont **aucune visibilite reseau** sur le LAN de l'entreprise. Le SMSC, accessible uniquement depuis le reseau local, est invisible depuis l'infrastructure Vercel.

Meme si le code SMPP pouvait tourner en serverless (ce qui n'est pas le cas), la connexion TCP vers `SMPP_HOST` (IP privee) serait refusee au niveau reseau (`ETIMEDOUT` ou `ECONNREFUSED`).

### 2.4. Pas de `deliver_sm` entrant

SMPP est **bidirectionnel** : le SMSC envoie des `deliver_sm` (accuses de reception, messages entrants MO) sur la session liee. Ces PDUs arrivent de maniere asynchrone, pas en reponse a une requete HTTP. En serverless, il n'y a personne pour les recevoir.

### 2.5. Resume des incompatibilites

| Besoin | Vercel serverless | Impact |
|--------|-------------------|--------|
| Connexion TCP persistante (SMPP bind) | Impossible | Aucun SMS ne peut etre envoye |
| Workers BullMQ (boucle infinie) | Impossible | La file d'attente ne se vide jamais |
| Reception DLR/MO (`deliver_sm`) | Impossible | Pas d'accuses de reception |
| Acces au reseau prive (SMSC) | Impossible | Le SMSC est inatteignable |
| Etat in-process (`globalThis` singletons) | Non fiable | Rate limiter, alert manager perdus |
| Graceful shutdown (SIGTERM) | Non garanti | Sessions SMPP orphelines |

---

## 3. Solutions envisageables

### 3.1. VPN / Tunnel (Tailscale, WireGuard, Cloudflare Tunnel)

**Principe** : Creer un tunnel reseau entre Vercel et le reseau local pour rendre le SMSC accessible.

**Probleme** : Meme si le reseau est resolu, les contraintes serverless (pas de TCP persistant, pas de worker, pas de `deliver_sm`) restent. Le tunnel ne resout que le point 2.3, pas les points 2.1, 2.2 et 2.4. Cette solution seule est **insuffisante**.

### 3.2. SMPP-to-HTTP Gateway tier (ex: Jasmin, PlivioSMPP)

**Principe** : Deployer un gateway tiers qui convertit SMPP en API HTTP (REST/webhook). L'app Next.js sur Vercel appelle une API HTTP pour envoyer, et recoit les DLR via webhook.

**Avantages** : Elimine completement le probleme TCP/serverless.
**Inconvenients** : Ajoute un composant tiers a operer, necessite quand meme un serveur sur le reseau local (pour le gateway), et les workers BullMQ restent un probleme.

### 3.3. Architecture hybride : Vercel (frontend) + serveur persistant (SMPP bridge)

**Principe** : Deployer le frontend Next.js sur Vercel, mais extraire tout le code SMPP + BullMQ dans un **service backend persistant** qui tourne sur un serveur ayant acces au reseau local (VPS, VM on-prem, container Docker).

**Avantages** : Separation claire des responsabilites, chaque composant tourne dans l'environnement adapte.
**Inconvenients** : Necessite d'operer un second serveur, de gerer la communication Vercel <-> bridge.

### 3.4. Deploiement complet sur un VPS (pas de Vercel)

**Principe** : Deployer l'application Next.js entiere sur un VPS (Hetzner, OVH, DigitalOcean) ou un serveur on-prem avec Docker, derriere Cloudflare (proxy/CDN). Le processus Node.js tourne en permanence, exactement comme en local.

**Avantages** : Zero refactoring. Le code fonctionne tel quel. Cloudflare gere le DNS, le SSL, la protection DDoS, et le cache des assets statiques.
**Inconvenients** : On perd l'auto-scaling et le zero-ops de Vercel. Il faut gerer le serveur (mises a jour, monitoring, redemarrage).

### 3.5. Solution recommandee : Architecture hybride avec Cloudflare Tunnel **(3.3)**

C'est la seule approche qui combine les avantages de Vercel (frontend) avec la realite technique du connecteur SMPP.

---

## 4. Solution recommandee — Architecture hybride

### Vue d'ensemble

```
                          INTERNET
                             |
              +--------------+--------------+
              |                             |
     [ Vercel ]                   [ Cloudflare ]
     Next.js frontend             DNS + CDN + Tunnel
     Server Actions               |
     Dashboard UI                 | Cloudflare Tunnel (cloudflared)
              |                   |
              |         +---------+---------+
              |         |                   |
              +-------->|  SMPP Bridge      |<----------- [ SMSC ]
                  HTTPS |  (VPS ou on-prem) |  TCP/SMPP      (LAN)
                  API   |                   |
                        |  - API REST       |
                        |  - BullMQ workers |
                        |  - SMPP client    |
                        |  - Redis          |
                        +---------+---------+
                                  |
                                  v
                          [ PostgreSQL ]
                            (Supabase)
```

### Composants

#### A. Frontend (Vercel)

L'application Next.js actuelle, **sans** le code SMPP ni les workers BullMQ. Les Server Actions et Route Handlers appellent le SMPP Bridge via HTTPS au lieu d'acceder directement au client SMPP.

- Dashboard UI (React)
- Auth Supabase (inchange)
- Server Actions (proxy vers le bridge)
- Route Handlers publics (`/api/sms/send`, etc.) — deleguent au bridge

#### B. SMPP Bridge (VPS ou serveur on-prem)

Un service Node.js/Fastify ou Hono expose une API REST interne, securisee par un token partage ou mTLS. Il heberge :

- Le client SMPP (`SmppClient`, `SmppSessionManager`) — connexion TCP persistante vers le SMSC.
- Les workers BullMQ (sms-queue, campaign-queue, webhooks-queue) — connexion TCP persistante vers Redis.
- Le rate limiter et l'alert manager en memoire.
- Un endpoint webhook que Vercel appelle pour envoyer des SMS.
- La logique de reception des DLR/MO qui met a jour PostgreSQL.

**Acces reseau** : Le bridge est sur le meme reseau que le SMSC (ou accessible via VPN/Cloudflare Tunnel si sur un VPS externe).

#### C. Redis

- **Si le bridge est on-prem** : Redis local sur la meme machine.
- **Si le bridge est sur un VPS** : Redis sur le VPS, ou Upstash (TCP, pas REST).
- BullMQ a besoin d'une connexion TCP ioredis dans tous les cas.

#### D. Communication Vercel <-> Bridge

| Direction | Methode | Securite |
|-----------|---------|----------|
| Vercel -> Bridge | HTTPS POST/GET (API REST) | Bearer token partage (`BRIDGE_API_KEY`) |
| Bridge -> Vercel | Webhook HTTPS (DLR, status updates) | HMAC signature |
| Bridge -> PostgreSQL | Connection Prisma directe | `DATABASE_URL` |

### API du SMPP Bridge (contrat minimal)

```
POST   /api/v1/sms/send         { to, text, from?, scheduledAt?, orgId }
POST   /api/v1/sms/bulk         { messages: [...], campaignId?, orgId }
GET    /api/v1/smpp/status       -> { state, connected, host, port, ... }
POST   /api/v1/smpp/connect
POST   /api/v1/smpp/disconnect
GET    /api/v1/queue/stats       -> { waiting, active, delayed, failed, ... }
POST   /api/v1/queue/retry/:jobId
```

### Pourquoi Cloudflare Tunnel

Si le SMPP Bridge tourne sur un serveur on-prem (meme reseau que le SMSC), **Cloudflare Tunnel** (`cloudflared`) permet de l'exposer a Internet sans ouvrir de port :

- `cloudflared` cree un tunnel sortant depuis le serveur on-prem vers le reseau Cloudflare.
- Vercel appelle `https://bridge.akis.example.com` → Cloudflare route vers le tunnel → arrive sur le bridge.
- Pas de NAT, pas de port forwarding, pas de VPN.
- Cloudflare ajoute automatiquement TLS, protection DDoS, et Access Policies (authentification supplementaire).

```
Vercel --HTTPS--> Cloudflare CDN --Tunnel--> cloudflared --localhost--> Bridge :3001
```

---

## 5. Plan d'implementation

### Phase 1 — Extraction du SMPP Bridge (semaine 1-2)

**Objectif** : Extraire le code SMPP + BullMQ dans un service autonome.

#### Etape 1.1 : Creer le projet bridge

- Initialiser un nouveau projet Node.js (`smpp-bridge/`) dans le meme repo ou dans un repo separe.
- Choisir le framework HTTP : **Fastify** (performant, schema validation) ou **Hono** (deja dans les deps).
- Configurer TypeScript, ESLint, pnpm.

#### Etape 1.2 : Migrer le code SMPP

- Copier `core/lib/smpp/` (client, session-manager, config, instance, send-sms, rate-limiter, alerts, wire-delivery-receipts) dans le bridge.
- Copier `core/lib/queue/` (sms-queue, campaign-queue, webhooks-queue, redis).
- Copier `core/lib/sms-encoding.ts`, `core/lib/logger.ts`, `core/lib/prisma.ts`.
- Copier `core/lib/shutdown.ts` et `instrumentation.ts`.
- Adapter les imports (`@/` -> chemins relatifs ou nouvel alias).

#### Etape 1.3 : Exposer l'API REST du bridge

- Creer les routes REST (`/api/v1/sms/send`, `/api/v1/smpp/status`, etc.).
- Ajouter un middleware d'authentification par bearer token (`BRIDGE_API_KEY`).
- Valider les payloads avec Zod (reutiliser les schemas existants).

#### Etape 1.4 : Adapter le bridge pour recevoir les DLR

- Quand un DLR arrive (`deliver_sm`), le bridge met a jour `SmsMessage` dans PostgreSQL directement (il a deja Prisma).
- Optionnel : le bridge appelle un webhook sur Vercel pour notifier le frontend en temps reel.

### Phase 2 — Adapter le frontend Next.js (semaine 2-3)

**Objectif** : Le frontend ne parle plus directement au SMPP ni a BullMQ.

#### Etape 2.1 : Creer un client HTTP pour le bridge

- `core/lib/bridge-client.ts` : un module avec `fetch()` vers le bridge, authentifie par `BRIDGE_API_KEY`.
- Variables d'environnement : `BRIDGE_URL`, `BRIDGE_API_KEY`.

#### Etape 2.2 : Modifier les Server Actions

- `core/actions/sms.ts` : au lieu d'appeler `enqueueSms()` localement, appeler `bridgeClient.sendSms()`.
- `core/actions/campaigns.ts` : deleguer au bridge.
- Les actions de lecture (liste des messages, CDR) restent inchangees (requete Prisma directe vers Supabase).

#### Etape 2.3 : Modifier les Route Handlers

- `app/api/sms/send/route.ts` : deleguer au bridge.
- `app/api/smpp/*/route.ts` (status, connect, disconnect) : proxy vers le bridge.
- `app/api/sms/status/route.ts`, `app/api/sms/cdr/route.ts` : inchanges (lecture PostgreSQL).

#### Etape 2.4 : Adapter le polling de statut

- Le Zustand store (`smpp-status-store.ts`) polle deja `/api/smpp/status` — ce endpoint est maintenant un proxy vers le bridge. Aucun changement cote client.

#### Etape 2.5 : Supprimer le code SMPP du frontend

- Retirer les imports de `smpp`, `bullmq`, `ioredis` des bundles Next.js.
- Retirer `serverExternalPackages: ["smpp"]` de `next.config.ts` si `smpp` n'est plus dans les deps.
- Verifier que `pnpm build` passe sans ces deps.

### Phase 3 — Infrastructure et deploiement (semaine 3-4)

#### Etape 3.1 : Deployer le bridge

**Option A — Serveur on-prem (meme reseau que le SMSC)** :
- Docker Compose : bridge + Redis.
- `docker-compose.yml` avec healthcheck, restart policy, volume pour les logs.
- Le bridge accede au SMSC directement (meme LAN).

**Option B — VPS externe** :
- Deployer le bridge sur un VPS (Hetzner, DigitalOcean).
- Le SMSC doit etre accessible depuis le VPS (VPN site-to-site, ou le SMSC est expose sur Internet avec IP whitelisting).

#### Etape 3.2 : Configurer Cloudflare Tunnel (si option A)

```bash
# Sur le serveur on-prem
cloudflared tunnel create smpp-bridge
cloudflared tunnel route dns smpp-bridge bridge.akis.example.com

# config.yml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: bridge.akis.example.com
    service: http://localhost:3001
  - service: http_status:404
```

- Ajouter une **Cloudflare Access Policy** pour restreindre l'acces au bridge (par service token ou IP).

#### Etape 3.3 : Deployer le frontend sur Vercel

- Ajouter les variables d'environnement dans Vercel : `BRIDGE_URL=https://bridge.akis.example.com`, `BRIDGE_API_KEY=...`.
- `pnpm build` ne doit plus dependre de `smpp`, `bullmq`, `ioredis`.
- Deployer.

#### Etape 3.4 : Configurer le DNS Cloudflare

- `akis.example.com` → Vercel (CNAME `cname.vercel-dns.com`, proxy orange).
- `bridge.akis.example.com` → Cloudflare Tunnel (CNAME auto-cree par `cloudflared tunnel route dns`).

### Phase 4 — Tests et mise en production (semaine 4-5)

#### Etape 4.1 : Tests d'integration

- Envoyer un SMS via le dashboard → verifier qu'il passe par Vercel → bridge → SMSC.
- Envoyer un SMS via l'API (`/api/sms/send` avec bearer token) → meme chemin.
- Verifier la reception des DLR (accuse de reception) → le bridge met a jour PostgreSQL → le dashboard affiche le statut.
- Tester le scheduling (SMS programme) → BullMQ delayed job sur le bridge.
- Tester les campagnes bulk.
- Tester la reconnexion SMPP (redemarrer le SMSC, verifier que le bridge se reconnecte).

#### Etape 4.2 : Monitoring

- Logs structures (pino) sur le bridge, agregation via Grafana/Loki ou Datadog.
- Uptime check sur `https://bridge.akis.example.com/health`.
- Alertes sur : bridge down, SMPP disconnected, queue backlog > seuil.

#### Etape 4.3 : Securite

- mTLS ou Cloudflare Access Service Token entre Vercel et le bridge.
- `BRIDGE_API_KEY` en variable d'environnement Vercel (jamais dans le code).
- Le SMSC n'est jamais expose a Internet.
- Redis du bridge n'est accessible que depuis localhost (pas de port expose).

---

## 6. Checklist de suivi

### Phase 1 — Extraction du SMPP Bridge

- [x] Initialiser le projet `smpp-bridge/` (pnpm, TypeScript, Hono + @hono/node-server)
- [x] Copier et adapter `core/lib/smpp/*` dans le bridge (config, client, session-manager, instance, send-sms, rate-limiter, alerts, delivery-receipt, wire-delivery-receipts)
- [x] Copier et adapter `core/lib/queue/*` dans le bridge (redis, sms-queue, campaign-queue, webhooks-queue)
- [x] Copier `core/lib/sms-encoding.ts`, `logger.ts`, `prisma.ts`
- [x] Copier et adapter `core/lib/shutdown.ts`
- [x] Implementer les routes REST (`/api/v1/sms/send`, `/api/v1/sms/bulk`, `/api/v1/smpp/status`, `/api/v1/smpp/connect`, `/api/v1/smpp/disconnect`, `/api/v1/queue/stats`, `/api/v1/queue/retry/:jobId`)
- [x] Ajouter l'authentification par bearer token (`BRIDGE_API_KEY`) via middleware Hono
- [x] Ecrire un `Dockerfile` et `docker-compose.yml` (bridge + Redis)
- [ ] Tester le bridge en local : bind SMPP, envoyer un SMS, recevoir un DLR
- [x] Ajouter un endpoint `/health` (etat SMPP + Redis + DB)

### Phase 2 — Adapter le frontend Next.js

- [x] Creer `core/lib/bridge-client.ts` (client HTTP vers le bridge : SMS, SMPP, queue, campagnes, webhooks, rapports planifies)
- [x] Modifier `core/features/sms/queries/send-sms.ts` (utilise par `core/actions/sms.ts`) pour deleguer au bridge
- [x] Modifier `core/actions/campaigns.ts` pour deleguer au bridge (launch/cancel/resend)
- [x] Modifier `app/api/sms/send/route.ts` pour deleguer au bridge
- [x] Modifier `app/api/smpp/*/route.ts` pour proxy vers le bridge (status, connect, disconnect, disconnect/[key], restart, query, state)
- [x] Verifier que le Zustand store fonctionne toujours (proxy transparent, aucun changement cote client)
- [x] Migrer aussi `core/actions/queue.ts`, `dashboard.ts`, `connectors.ts`, `webhooks.ts`, `reports.ts` (usages directs de session-manager/BullMQ non prevus initialement mais necessaires pour retirer les deps)
- [x] Retirer `smpp`, `bullmq`, `ioredis` des deps du frontend (+ suppression de `core/lib/smpp/*`, `core/lib/queue/*`, `core/lib/shutdown.ts`, `core/features/reports/queue.ts`, deplaces/dupliques dans le bridge)
- [x] Retirer `serverExternalPackages: ["smpp"]` de `next.config.ts`
- [ ] Verifier que `pnpm build` passe proprement — **bloque par des erreurs Prisma preexistantes et non liees** (`core/actions/cdr.ts`, `contacts.ts`, `messages.ts`, `providers.ts` : schema/action drift, confirme via `git diff` que ces fichiers n'ont pas ete touches par cette migration)
- [x] Verifier que `pnpm typecheck` passe pour tout le code touche par la migration (les seules erreurs restantes sont les memes 4 fichiers preexistants + `core/lib/supabase/middleware.ts`/`server.ts`, non lies)

### Phase 3 — Infrastructure

Guide operationnel complet (commandes, options on-prem/VPS, Cloudflare Tunnel, Access Policy, rollback) : voir [`Infrastructure.md`](Infrastructure.md). Les cases ci-dessous ne sont cochees qu'une fois l'action reellement executee sur l'infrastructure, pas au moment ou le guide est ecrit.

- [ ] Provisionner le serveur pour le bridge (on-prem ou VPS)
- [ ] Installer Docker + Docker Compose
- [ ] Deployer le bridge + Redis
- [ ] Installer `cloudflared` et creer le tunnel
- [ ] Configurer le DNS : `bridge.akis.example.com` → tunnel
- [ ] Ajouter une Cloudflare Access Policy
- [ ] Configurer les variables d'environnement sur Vercel
- [ ] Deployer le frontend sur Vercel
- [ ] Configurer le DNS : `akis.example.com` → Vercel

### Phase 4 — Validation

- [ ] Test : SMS unitaire via le dashboard
- [ ] Test : SMS via l'API bearer token
- [ ] Test : Reception DLR (accuse de reception)
- [ ] Test : SMS programme (scheduled)
- [ ] Test : Campagne bulk
- [ ] Test : Reconnexion SMPP apres coupure
- [ ] Test : Cold start Vercel (premiere requete apres inactivite)
- [ ] Configurer le monitoring (health check, logs, alertes)
- [ ] Documenter la procedure de deploiement/rollback du bridge
- [ ] Mettre a jour `CLAUDE.md` avec la nouvelle architecture
