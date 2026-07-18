# ✅ SMS Gateway Pro — Plan de Réalisation Ajusté
> Version 4.0 — akis73 / Djibouti Telecom
> Mis à jour le 22 juin 2026 — basé sur l'analyse réelle du code

---

## 🎯 Situation de départ (réalité du code)

### Ce qui EST fait et fonctionne ✅
- [x] Moteur SMPP in-process complet (client, session-manager, reconnexion, heartbeat, TLS)
- [x] Envoi SMS réel via `submit_sm` (GSM-7/UCS-2, validation E.164, retry, timeout)
- [x] Routes API SMPP : `/connect`, `/disconnect`, `/status`, `/restart`
- [x] Parsing DLR complet (DELIVRD / UNDELIV / EXPIRED / REJECTD / ACCEPTD)
- [x] Rate limiter token bucket aligné sur `SMPP_MAX_TPS`
- [x] Validation Zod de la config SMPP au démarrage
- [x] API publique d'envoi avec auth Bearer token (`/api/sms/send`)
- [x] Graceful shutdown (unbind → close)
- [x] Schéma Prisma multi-tenant complet + 1 migration appliquée
- [x] UI complète visuellement (toutes les pages existent)

### Ce qui est à supprimer / abandonner 🗑️ ✅ FAIT
- [x] Supprimer `core/lib/smpp/worker-client.ts` (code mort, jamais importé)
- [x] Supprimer `scripts/start-smpp-worker.ts` (standalone HTTP server, jamais démarré)
- [x] Supprimer le script npm `smpp:worker` de `package.json`
- [x] Retirer `SMPP_WORKER_URL`, `SMPP_WORKER_PORT`, `SMPP_WORKER_INTERNAL_TOKEN` de partout (déjà absents de `.env.example` et `core/lib/smpp/config.ts` sur `main`)
- [x] Pas de worker SMPP séparé — le SMPP reste **in-process**

### Les 3 vrais blocages restants ❌
1. **Queue in-memory** → perte de SMS au redémarrage
2. **Pages sur données mock** → rien de réel en production
3. **Auth/RBAC incomplets** → dashboard accessible sans login

---

## 🏗️ Phase 1 — Fondations  🔴 CRITIQUE

> **Objectif :** Persistance des données + sécurité de base. Sans cette phase, rien ne peut aller en production.

### 1.0 Nettoyage du code mort ✅ FAIT
- [x] Supprimer `core/lib/smpp/worker-client.ts`
- [x] Supprimer `scripts/start-smpp-worker.ts`
- [x] Retirer le script npm `smpp:worker` de `package.json`
- [x] Retirer toute référence à `SMPP_WORKER_URL` / `SMPP_WORKER_PORT` / `SMPP_WORKER_INTERNAL_TOKEN` (déjà absents sur `main`)
- [x] `.env.example` déjà propre — aucune variable orpheline

### 1.1 Migration Queue Persistante — BullMQ in-process ✅ FAIT
> BullMQ tourne dans le **même process Next.js**, pas dans un service séparé

- [x] Installer les dépendances : `pnpm install bullmq ioredis`
- [x] Créer `core/lib/queue/redis.ts` — connexion Upstash Redis
- [x] Créer `core/lib/queue/sms-queue.ts` — remplace `core/lib/smpp/queue.ts`
- [x] Configurer le worker BullMQ in-process (démarré au boot de Next.js)
- [x] Brancher `submit_sm` sur BullMQ (enqueue → dequeue → sendSms)
- [x] Configurer la dead-letter queue (jobs en échec après 3 retries)
- [x] Configurer les delayed jobs (SMS programmés)
- [x] Tester la persistance : redémarrer le serveur → les SMS en attente survivent
- [x] Supprimer l'ancienne `core/lib/smpp/queue.ts` in-memory (remplacé par un wrapper rétro-compatible vers BullMQ)
- [x] Ajouter `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` dans `.env.example`

### 1.2 Authentification Supabase Complète ✅ FAIT
- [x] Créer `middleware.ts` à la racine Next.js — protège toutes les routes `/(dashboard)`
- [x] Redirection vers `/login` si token Supabase invalide ou absent
- [x] Refresh automatique du token (access_token 1h / refresh_token 7j)
- [x] Implémenter le logout complet (Supabase `signOut()` + suppression cookie)
- [x] Tester : accéder à `/dashboard` sans être connecté → redirige vers `/login`

### 1.3 RBAC — Guards sur les routes API ✅ FAIT
- [x] Créer `core/lib/auth/org-guard.ts` — vérifie que `userId` appartient à `organizationId`
- [x] Créer `core/lib/auth/role-guard.ts` — vérifie la permission requise par route
- [x] Appliquer `orgGuard` sur toutes les routes API existantes (utilisé via `requirePermission`)
- [x] Appliquer `roleGuard` sur les routes sensibles (`sms:send` appliqué sur `/api/sms/send`)
- [x] Tester avec chaque rôle (SUPER_ADMIN, ADMIN, OPERATOR, DEVELOPER, VIEWER)

### 1.4 Page Utilisateurs & Rôles `/users` ✅ FAIT
- [x] DataTable : email, nom, rôle, statut (ACTIVE / INVITED / SUSPENDED), dernière connexion
- [x] Créer un utilisateur (email + rôle) → envoie invitation Resend (token TTL 48h)
- [x] Modifier le rôle et les permissions granulaires d'un utilisateur
- [x] Suspendre un utilisateur (accès bloqué immédiatement)
- [x] Supprimer un utilisateur (soft-delete)
- [x] Lien vers l'audit log filtré par utilisateur (audit log déjà écrit à chaque mutation)

---

## 📨 Phase 2 — Branchement Prisma : Messaging   🔴 CRITIQUE

> **Objectif :** Remplacer toutes les données mock par de vraies données Prisma. Pages une par une.

### 2.1 Dashboard `/` — KPIs réels ✅ FAIT
- [x] Remplacer les `kpis` hardcodés par des requêtes Prisma (`COUNT`, `SUM`)
- [x] SMS envoyés 24h / 7j / 30j (avec variation % vs période précédente)
- [x] Taux de livraison global (DELIVRD / total)
- [x] Coût total en FDJ sur la période (depuis `CreditTransaction.DEBIT`)
- [x] Solde crédits depuis `CreditBalance`
- [x] Profondeur queue BullMQ (jobs en attente)
- [x] Nombre de connecteurs SMPP actifs (status=BOUND)
- [x] Graphiques Recharts sur données réelles (volume SMS 7j, répartition par statut)
- [x] Top 5 campagnes actives
- [x] Statut live des connecteurs (badge vert/rouge)

### 2.2 Historique SMS `/sms/history` ✅ FAIT
- [x] DataTable paginée cursor-based sur `SmsMessage` Prisma
- [x] Filtres combinables : date range, statut, DLR, numéro, campagne, provider, connecteur (`listMessagesAction`)
- [x] Recherche full-text sur le contenu (ILIKE, index GIN à ajouter en migration future)
- [x] Sheet latéral de détail : tous les champs, timeline DLR, coût, connecteur
- [x] Export CSV avec filtres actifs (`exportMessagesAction` jusqu'à 100 000 lignes)
- [x] Affichage du coût FDJ par ligne (champ `cost` Prisma)

### 2.3 Suivi DLR `/sms/dlr` ✅ FAIT
- [x] Compteurs par statut DLR depuis Prisma (DELIVRD / UNDELIV / EXPIRED / REJECTD)
- [x] Graphique barres : répartition par statut (`getDlrBreakdownAction`)
- [x] Timeline par message : submit_sm → DLR reçu avec latence
- [ ] Alerte automatique si UNDELIV > 10% sur 1h glissante (reporté Phase 6)
- [x] Push temps réel via Supabase Realtime (`SmsLiveStatus` composant, table `SmsMessage`)

### 2.4 File d'Attente `/sms/queue` ✅ FAIT
- [x] Vue BullMQ réelle : counts waiting/active/delayed/failed/completed exposés par `listQueueAction`
- [x] Profondeur par connecteur
- [x] Actions : pause / reprise du worker BullMQ (`pauseSmsWorker` / `resumeSmsWorker`)
- [x] Action : retry manuel d'un job (re-enqueue BullMQ)
- [x] Action : purge (BullMQ `queue.drain(true)` + Prisma CANCELLED)
- [x] Détail d'un job : payload, tentatives, dernier code d'erreur (champ `dlrErrorCode`)

### 2.5 Templates SMS `/sms/templates` ✅ FAIT
- [x] CRUD complet branché sur `SmsTemplate` Prisma
- [x] Variables dynamiques `{{var}}` avec liste auto-détectée
- [x] Catégories (Marketing, OTP, Alerte, Notification, Transactionnel)
- [x] Preview avec remplacement des variables sur un contact exemple
- [x] Compteur segments et encodage GSM-7/UCS-2 en temps réel
- [x] Soft-delete (`deletedAt`)

### 2.6 SMS Programmé ✅ FAIT (back-end)
- [x] Sélecteur date/heure avec fuseau (UI existante)
- [x] BullMQ `delayed job` : `scheduledAt` → delay calculé dans `enqueueSms()`
- [x] Statut Prisma `PENDING` + `scheduledAt` persisté
- [x] Annulation via `purgeQueueAction` (status `CANCELLED`)

### 2.7 Panneau Live Post-Envoi ✅ FAIT
- [x] Abonnement Supabase Realtime sur le `messageId` après envoi (`SmsLiveStatus`)
- [x] Statuts animés (QUEUED → SENDING → SENT → DELIVERED)
- [x] Timeline DLR avec horodatages
- [x] Affichage du coût final après livraison

---

## 👥 Phase 3 — Branchement Prisma : Contacts & Campagnes   🟡 HAUTE

### 3.1 Contacts `/contacts` ✅ FAIT
- [x] CRUD complet branché sur `Contact` Prisma (`listContactsAction`, `createContactAction`, `updateContactAction`, `deleteContactAction`)
- [x] Validation E.164 côté serveur (regex stricte) — libphonenumber-js côté UI déjà installé
- [x] Import CSV/Excel : bulk insert avec déduplication par phone + rapport (`importContactsAction`)
- [x] Recherche full-text (phone, nom, prénom, email, tags) via `searchContactsAction`
- [x] Historique SMS par contact (10 derniers) via `getContactHistoryAction`
- [x] Gestion opt-out : `toggleBlacklistAction` + page `/contacts/blacklist`
- [x] Exclusion automatique des envois (déjà actif depuis Phase 2 sur `/api/sms/send`)

### 3.2 Groupes de Contacts `/contacts/groups` ✅ FAIT
- [x] CRUD groupes statiques branché sur `ContactGroup` + `ContactGroupMember` Prisma
- [x] Groupes dynamiques : règles JSON stockées dans `dynamicRules` (anyTags / allTags / country / excludeBlacklisted)
- [x] Résolveur dynamique : `resolveDynamicGroupContactIds` + `resolveGroupContactsAction`
- [x] Compteur membres calculé (statique = `_count.members`, dynamique = résolution live)
- [x] Exclusions croisées : `listExcludedContactsForCampaignAction` (union des groupes d'exclusion + blacklistes)

### 3.3 Campagnes `/campaigns` ✅ FAIT (back-end)
- [x] DataTable filtrée par statut depuis `Campaign` Prisma (`listCampaignsAction`)
- [x] Métriques inline : `sentCount`, `deliveredCount`, `failedCount` (Campaign fields)
- [x] Actions : `launchCampaignAction`, `pauseCampaignAction`, `resumeCampaignAction`, `cancelCampaignAction`, `duplicateCampaignAction`

#### Wizard Création — UI existante côté `CampaignsClient`
- [x] Création Prisma (`createCampaignAction`) avec audience pré-calculée
- [ ] Wizard 5 étapes (UI à ajuster sur les nouveaux actions)

#### Moteur d'Exécution ✅ FAIT
- [x] Chunking BullMQ : batches de 1 000 messages (`core/lib/queue/campaign-queue.ts`)
- [x] In-process worker `campaign-chunks` qui crée les `SmsMessage` et les enfile sur la queue `sms`
- [x] `incrementCampaignCounters()` atomique exporté (utilisable par le worker SMS / DLR)
- [x] Complétion automatique : passage en `COMPLETED` quand `sentCount + failedCount >= totalRecipients`
- [ ] Rapport PDF de fin (Phase 5)

### 3.4 Opt-Out & Liste Noire ✅ FAIT
- [x] À la réception d'un MO `STOP` / `STOPALL` / `UNSUBSCRIBE` / `ARRET` (FR) → `isBlacklisted = true` automatique + `AuditLog` (`wire-delivery-receipts.ts`)
- [x] Vérification `isBlacklisted` dans `/api/sms/send` (Phase 2) ET dans le worker de campagne avant chaque enqueue
- [x] Interface de gestion manuelle : page `/contacts/blacklist` avec déblocage en un clic

---

## 🔧 Phase 4 — Branchement Prisma : Infrastructure   🟡 HAUTE

### 4.1 Fournisseurs SMS `/providers` ✅ FAIT
- [x] CRUD branché sur `SmsProvider` Prisma (`core/actions/providers.ts`)
- [x] Statistiques par fournisseur (volume + taux livraison) calculées via `SmsMessage.groupBy`
- [x] Tableau multi-provider avec activation/désactivation (`/providers`)

### 4.2 Sender IDs `/sender-ids` ✅ FAIT
- [x] CRUD branché sur `SenderId` Prisma (`core/actions/sender-ids.ts`)
- [x] Workflow d'approbation PENDING → APPROVED / REJECTED restreint à SUPER_ADMIN via `requireRole("SUPER_ADMIN")`
- [x] `listApprovedSenderIdsAction()` pour les formulaires d'envoi (APPROVED uniquement)
- [x] Audit log sur create/approve/reject

### 4.3 Routage SMS `/routes` ✅ FAIT
- [x] CRUD branché sur `SmsRoute` Prisma (`core/actions/routes.ts`)
- [x] Moteur de routage : `resolveRouteForDestination()` évalue les règles par priorité décroissante puis fallback `isDefault` puis premier connecteur BOUND
- [x] `/api/sms/send` utilise le moteur quand aucun `connectorId` n'est fourni (champ `routeId` persisté sur `SmsMessage`)
- [x] Page de test : `evaluateRouteAction("+253...")` retourne la route + connecteur choisis
- [x] Historique des modifications via `AuditLog`

### 4.4 Connecteurs SMPP `/connectors` — UI branchée ✅ FAIT
- [x] CRUD complet avec RBAC (create/update/delete) sur `SmppConnector` Prisma
- [x] Badge statut live déjà fourni par `sessionManager` via `/api/smpp/status`
- [x] Métriques par connecteur : `getConnectorStatsAction()` (counts par statut + latence moyenne submit→DLR sur les 1 000 derniers livrés)
- [x] Logs SMPP par connecteur : `getConnectorLogsAction()` (100 derniers `AuditLog` filtrés)
- [x] Rotation des credentials : `updateConnectorAction` déconnecte gracieusement la session puis la ré-instancie via `startConnectorSession()`

### 4.5 Session Manager Multi-Connecteurs ✅ FAIT
- [x] `Map<connectorId, SmppClient>` déjà disponible dans `sessionManager`
- [x] `loadOrgConnectors()` charge tous les connecteurs actifs depuis Prisma au boot
- [x] `pickConnector(organizationId)` : round-robin entre connecteurs BOUND
- [x] Failover : connecteur non-BOUND ou suspendu → écarté automatiquement du tour
- [x] Circuit breaker : après 10 échecs consécutifs → `recordConnectorFailure()` flip `status = ERROR` + cooldown 60s (`SMPP_CIRCUIT_THRESHOLD`, `SMPP_CIRCUIT_COOLDOWN_MS`)

---

## 📊 Phase 5 — Analytics & Facturation   🟡 HAUTE

### 5.1 Rapports & Statistiques `/reports` ✅ FAIT
- [x] Filtres : période (aujourd'hui / 7j / 30j / 90j / 365j / personnalisé) + dimensions (provider / connector / country / campaign)
- [x] Graphique aire : volume SMS par jour (Recharts)
- [x] Graphique barres groupées : taux de livraison par dimension choisie
- [x] Donut chart : répartition par statut DLR
- [x] Courbe coût cumulé par période
- [x] Export CSV (`exportReportCsvAction`)
- [x] Export PDF (`exportReportPdfAction` via jsPDF + jsPDF-autotable)
- [x] Rapport planifié : BullMQ `repeatable job` cron + email Resend (`scheduleReportAction`, `listScheduledReportsAction`, `cancelScheduledReportAction`)

### 5.2 Facturation `/billing` ✅ FAIT
- [x] Solde crédits depuis `CreditBalance` (rechargement de la page recharge la valeur ; Supabase Realtime peut être branché ultérieurement)
- [x] Historique transactions depuis `CreditTransaction` Prisma (cursor pagination via `listTransactionsAction`)
- [x] Alertes seuil : si `balance < alertThreshold` → `Notification` créée pour chaque ADMIN/SUPER_ADMIN au franchissement du seuil (transaction atomique)
- [x] Rechargement manuel : `creditAccountAction({ amount, description, reference })` + dialog UI
- [x] Génération factures PDF mensuelles : `generateMonthlyInvoiceAction(year, month)` (jsPDF + autoTable)
- [x] Tableau de consommation par campagne / connecteur (`consumptionBreakdownAction` sur 30 jours)

---

## 🔐 Phase 6 — Système & Sécurité   🟠 MOYENNE

### 6.1 Webhooks `/webhooks` ✅ FAIT
- [x] CRUD branché sur `Webhook` + `WebhookDelivery` Prisma (`core/actions/webhooks.ts`)
- [x] Dispatcher : `dispatchEvent(orgId, event, payload)` enfile sur la queue BullMQ `webhooks` (à appeler depuis SMS/DLR/campaign workers)
- [x] Signature HMAC-SHA256 dans le header `X-SMS-Gateway-Signature`
- [x] Retry BullMQ : 3 tentatives avec backoff exponentiel (1min, 5min, 30min) sur HTTP 5xx
- [x] Page de test : `signTestPayloadAction(id)` enfile un payload de test
- [x] Logs de livraison persistés dans `WebhookDelivery` (statusCode, response, latencyMs, attempts)

### 6.2 Notifications `/notifications` ✅ FAIT (in-app)
- [x] Centre in-app branché sur `Notification` Prisma
- [x] Compteur non-lus exposé (`getUnreadCountAction()`) — à brancher dans le header pour le badge
- [x] Types : INFO, WARNING, ERROR, SUCCESS, CONNECTOR_DOWN, CREDITS_LOW, CAMPAIGN_COMPLETED, DLR_ALERT (depuis le schema Prisma)
- [x] Marquer tout comme lu → `markAllNotificationsReadAction()`
- [ ] Préférences par type + envoi email Resend (Phase 7)
- [ ] Templates email HTML responsive (Phase 7)

### 6.3 Journal d'Audit `/audit-log` ✅ FAIT
- [x] DataTable depuis `AuditLog` Prisma (`listAuditLogsAction`)
- [x] Filtres : utilisateur, action, entité, période (date range)
- [x] Diff avant/après affiché en JSON formatté dans un dialog
- [x] Export CSV (`exportAuditCsvAction`) jusqu'à 100 000 lignes
- [x] `prisma.auditLog.create()` déjà appelé par toutes les actions CRUD (users, contacts, campaigns, connectors, sender ids, routes, webhooks, settings, billing)

### 6.4 Paramètres Organisation `/settings` ✅ FAIT (général)
- [x] Général : nom, logo, timezone branché sur `Organization` Prisma (`getOrganizationSettingsAction` / `updateOrganizationSettingsAction`)
- [ ] SMPP par défaut (encodage, DLR, TTL) — déjà exposé via `.env` et `SmppConnector`
- [ ] Sécurité : politique mots de passe / 2FA obligatoire (Phase 7)
- [x] Facturation : seuil d'alerte crédit (`setAlertThresholdAction` en Phase 5)
- [ ] Notifications : adresses email admin (Phase 7)

### 6.5 Sécurité Avancée ✅ FAIT (foundations)
- [x] Chiffrement AES-256-GCM disponible via `core/lib/crypto/aes.ts` (`encryptSecret` / `decryptSecret`). Clé dérivée via `scrypt` depuis `SECRETS_ENCRYPTION_KEY` (>=32 chars). Format `v1:<iv>:<authTag>:<cipher>`. À brancher progressivement sur `SmppConnector.password` et `Webhook.secret` lors des prochaines écritures.
- [ ] 2FA TOTP via Supabase MFA (Phase 7)
- [x] Pino `redact` : `password`, `api_key`, `token`, `secret`, `authorization`, `credentials` (et leurs nested paths) masqués dans tous les logs
- [x] CORS : `CORS_ALLOWED_ORIGINS` documenté dans `.env.example` (validation à ajouter dans `middleware.ts` selon le besoin de production)

---

## 🚀 Phase 7 — Production   🟠 MOYENNE

### 7.1 Tests Unitaires (Vitest)
- [ ] Tests validations Zod (SMS, contacts, campagnes)
- [ ] Tests parseur DLR (tous les statuts)
- [ ] Tests encodage GSM-7/UCS-2 + calcul segments
- [ ] Tests `orgGuard` + `roleGuard`
- [ ] Tests `debitCredits()` (transaction atomique, solde insuffisant)
- [ ] Tests `dequeueMessages()` (pas de double traitement)
- [ ] Couverture > 80% sur le code métier

### 7.2 Tests E2E (Playwright)
- [ ] Parcours login / logout
- [ ] Parcours envoi SMS simple avec suivi DLR temps réel
- [ ] Parcours création et lancement d'une campagne
- [ ] Parcours import CSV contacts + groupe + opt-out
- [ ] Parcours consultation facturation (solde + historique)
- [ ] Parcours invitation utilisateur + changement de rôle

### 7.3 Mock SMPP Server (tests d'intégration)
- [ ] Serveur SMPP mock qui répond aux `submit_sm` avec `message_id`
- [ ] Simulation de DLR `deliver_sm` (DELIVRD, UNDELIV, EXPIRED)
- [ ] Simulation de déconnexions (test du backoff exponentiel)

### 7.4 Déploiement
> Pas de Vercel serverless — le SMPP est in-process et nécessite un process persistant

- [ ] `Dockerfile` Next.js en mode `node server` (pas de `output: standalone` serverless)
- [ ] `docker-compose.yml` : app + redis + postgres
- [ ] Tester le démarrage complet en local
- [ ] Valider le graceful shutdown (SIGTERM → BullMQ drain → SMPP unbind → exit 0)
- [ ] Déploiement cible : Fly.io / Railway / VPS avec PM2

### 7.5 Pipeline CI/CD
- [ ] Lint : ESLint + Prettier
- [ ] Typecheck : `tsc --noEmit`
- [ ] Tests : Vitest + Playwright
- [ ] Build : `next build`
- [ ] Deploy : push image Docker

### 7.6 Audit Sécurité
- [ ] OWASP Top 10 (injection, XSS, CSRF, IDOR)
- [ ] Valider isolation multi-tenancy (aucune fuite inter-organisation)
- [ ] Credentials SMPP jamais exposés dans les logs

### 7.7 Documentation
- [ ] API docs à jour (tous les endpoints `/v1/`)
- [ ] Runbook opérateur (démarrage, arrêt, incidents SMPP)
- [ ] Guide de déploiement complet
- [ ] Procédures de backup et restauration

---

## ☑️ Checklist Mise en Production

### Sécurité — Obligatoire
- [ ] Secrets dans un gestionnaire (jamais dans le repo Git)
- [ ] HTTPS + HSTS sur le domaine principal
- [ ] CSP strict (pas d'`unsafe-eval`)
- [ ] CORS restreint aux origines autorisées
- [ ] Credentials SMPP chiffrés AES-256 en BDD
- [ ] IP whitelist sur les clés API critiques
- [ ] Audit log actif sur toutes les actions CRUD

### SMPP — Obligatoire
- [x] Reconnexion automatique (backoff exponentiel) ✅ fait
- [x] Heartbeat `enquire_link` ✅ fait
- [x] Parsing DLR complet ✅ fait
- [x] Graceful shutdown (unbind → close) ✅ fait
- [x] Rate limiter token bucket ✅ fait
- [x] Queue BullMQ persistante (remplace in-memory)
- [ ] Health check `/api/health` exposé (db + redis + smpp)

### Application — Obligatoire
- [ ] Toutes les pages branchées sur Prisma (aucune donnée mock)
- [ ] Middleware auth Supabase actif sur toutes les routes `/(dashboard)`
- [ ] RBAC fonctionnel sur toutes les routes API
- [ ] Multi-tenancy strict (`organizationId` sur toutes les requêtes)
- [ ] Migrations Prisma appliquées en production

### Qualité — Recommandé
- [ ] Couverture tests > 80%
- [ ] Tests E2E sur les parcours critiques
- [ ] Pipeline CI/CD opérationnel
- [ ] Score Lighthouse > 90
- [ ] Runbook opérateur rédigé

---

## 📋 Variables d'Environnement — À configurer

 
### SMPP (in-process — pas de worker séparé)
- [ ] `SMPP_HOST`
- [ ] `SMPP_PORT` (défaut : 2775)
- [ ] `SMPP_SYSTEM_ID`
- [ ] `SMPP_PASSWORD`
- [ ] `SMPP_SOURCE_ADDR`
- [ ] `SMPP_BIND_MODE` (défaut : transceiver)
- [ ] `SMPP_MAX_TPS` (défaut : 100)
- [ ] `SMPP_ENQUIRE_LINK_INTERVAL_MS` (défaut : 30000)
- [ ] `SMPP_RECONNECT_DELAY_MS` (défaut : 5000)
- [ ] `SMPP_RECONNECT_MAX_DELAY_MS` (défaut : 60000)
- [ ] `SMPP_USE_TLS` (défaut : false)

### Queue (BullMQ + Upstash Redis)
- [ ] `UPSTASH_REDIS_REST_URL`
- [ ] `UPSTASH_REDIS_REST_TOKEN`

### Services externes
- [ ] `RESEND_API_KEY`
- [ ] `SENTRY_DSN`
- [ ] `NEXT_PUBLIC_APP_URL`
- [ ] `LOG_LEVEL` (défaut : info)
- [ ] `NEXT_PUBLIC_APP_ENV` (development / staging / production)

### ~~Variables à supprimer~~ 🗑️
- ~~`SMPP_WORKER_URL`~~ — code mort, worker non utilisé
- ~~`SMPP_WORKER_PORT`~~ — idem
- ~~`SMPP_WORKER_INTERNAL_TOKEN`~~ — idem

---

## 📅 Calendrier Résumé

| Phase | Contenu | Durée | Statut |
|-------|---------|-------|--------|
| **Phase 1** | Nettoyage + BullMQ + Auth + RBAC + /users | 3 semaines | 🔴 À démarrer |
| **Phase 2** | Dashboard + Messaging sur Prisma | 3 semaines | 🔴 À démarrer |
| **Phase 3** | Contacts + Campagnes sur Prisma | 3 semaines | 🟠 UI prête |
| **Phase 4** | Infrastructure + Multi-connecteurs | 3 semaines | 🟠 UI prête |
| **Phase 5** | Analytics + Facturation | 3 semaines | 🔴 À créer |
| **Phase 6** | Webhooks + Notifications + Audit + Settings | 3 semaines | 🔴 À créer |
| **Phase 7** | Tests + Docker + CI/CD + Production | 3 semaines | 🔴 À démarrer |
| **TOTAL** | MVP déployable complet | **21 semaines** | **~35% avancé** |

---

## 🎯 Métriques Cibles Production

- [ ] Taux de livraison SMS > 95%
- [ ] Disponibilité plateforme > 99,9%
- [ ] Temps de réponse API (p95) < 200ms
- [ ] Throughput SMS > 100 SMS/s
- [ ] Latence submit→DLR (p50) < 30s
- [ ] Temps de chargement pages (p75) < 1s
- [ ] Couverture de tests > 80%
- [ ] Score Lighthouse > 90

---

*Dernière mise à jour : 22 juin 2026 — SMS Gateway Pro v4.0 (akis73)*
*Plan basé sur l'analyse réelle du code — worker SMPP séparé abandonné, SMPP in-process conservé*
