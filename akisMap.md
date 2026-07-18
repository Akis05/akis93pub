# akisMap — Points d'amélioration

## 1. CRITIQUE — Secrets exposés dans le dépôt Git

- `ddd.txt` est une copie exacte de `.env` (mot de passe DB, `SUPABASE_SERVICE_ROLE_KEY`, SMPP creds) commitée dans Git et poussée sur GitLab. Le `.gitignore` ne couvre que les `.env*`, pas ce fichier.
- **Action :** supprimer `ddd.txt` de l'historique Git (`git filter-repo`), rotation immédiate des secrets Supabase (DB password, service-role key), SMPP credentials.

---

## 2. In-memory store fantôme (`core/lib/data/store.ts`)

`core/lib/data/store.ts` maintient un magasin en mémoire complet (contacts, messages, campaigns, connectors) avec données de seed, `Map<string, …>`, CRUD fonctions et un dashboard calculé dessus. Il est **utilisé en production** par `core/features/sms/queries/send-sms.ts` (`getConnector`, `createMessage`). Cela crée un état invisible (perdu au restart, désynchronisé de Prisma) qui coexiste silencieusement avec la base de données.

- **Action :** migrer les 2-3 call sites (`getConnector`, `createMessage`) vers Prisma, puis supprimer `core/lib/data/store.ts` entièrement. Plus aucun composant ne devrait lire l'état in-memory pour des données métier.

---

## 3. Duplication du code `requiresUnicode` / `computeSegments`

Cette paire de fonctions est copiée dans **4 fichiers** :
- `app/api/sms/send/route.ts`
- `core/lib/smpp/send-sms.ts`
- `core/features/sms/queries/send-sms.ts`
- `app/(dashboard)/sms/send/send-sms-form.tsx` (client-side)

La regex GSM est identique partout. Un bug fixé dans un fichier ne sera pas propagé aux autres.

- **Action :** extraire dans `core/lib/sms-encoding.ts` (isomorphe, utilisable côté client et serveur), importer partout.

---

## 4. Deux systèmes d'auth parallèles non alignés

Deux `AuthContext` distincts existent :
- `core/features/_shared/auth.ts` — utilisé par le module `sms` (Hono sub-app), ne contient pas `permissions`.
- `core/lib/auth/org-guard.ts` — utilisé par les Server Actions (`core/actions/*`), contient `permissions`.

Les deux font la même chose (Supabase JWT → Prisma User lookup) mais retournent des types différents et ne partagent aucun code.

- **Action :** consolider sur un seul `getAuthContext()` (celui de `org-guard.ts` est plus complet). Faire hériter ou déléguer l'autre.

---

## 5. Rate limiter SMPP : singleton non `globalThis`-safe

`core/lib/smpp/rate-limiter.ts` utilise un simple `let instance` module-scope. Contrairement à `sessionManager`, `prisma`, `redis`, et les queues BullMQ, il n'est **pas** accroché à `globalThis`, donc un hot-reload Next.js crée une deuxième instance (et un deuxième `setInterval` de 50ms) sans détruire la première.

- **Action :** appliquer le même pattern `globalThis as unknown as { __smppRateLimiter?: SmppRateLimiter }`.

---

## 6. `SmppAlertManager` : même problème de singleton

`core/lib/smpp/alerts.ts` souffre du même défaut — `let instance` au lieu de `globalThis`. En dev, chaque hot-reload crée un nouveau manager (avec un `setInterval` de 60s qui fuit).

- **Action :** même pattern `globalThis`.

---

## 7. `console.log` / `console.dir` en production

`core/lib/smpp/client.ts` et `core/lib/smpp/delivery-receipt.ts` contiennent des dizaines de `console.log` / `console.dir` avec des emojis. Le logger structuré (pino) existe et est utilisé en parallèle dans les mêmes fonctions. Les `console.*` échappent à la configuration du log level, ne sont pas structurés, et polluent stdout avec des emojis.

- **Action :** remplacer tous les `console.log`/`console.warn`/`console.error`/`console.dir` dans `core/` par des appels `logger.*` correspondants. Si le dump PDU brut est utile, le passer en `logger.debug({ pdu })`.

---

## 8. Double envoi : send form utilise le Server Action, l'API route utilise le BullMQ

Deux chemins d'envoi coexistent :
1. **Dashboard send form** → `sendSmsAction()` → `sendSmsViaSmpp()` → `sendSms()` directement (synchrone, hors queue).
2. **API `/api/sms/send`** → `enqueueSms()` → BullMQ worker → `sendSms()`.

Le chemin 1 contourne la queue, ne bénéficie pas du retry BullMQ, du rate limiting par la queue, et crée un message dupliqué (un dans le store in-memory via `createMessage`, un dans Prisma). Le chemin 2 gère tout via BullMQ.

- **Action :** unifier les deux chemins en passant par `enqueueSms()` dans tous les cas. Le formulaire dashboard devrait aussi enqueuer, pas envoyer directement.

---

## 9. Fallback "demo mode" silencieux

`core/features/sms/queries/send-sms.ts:123-127` : si l'envoi SMPP échoue, la fonction génère un faux `providerMessageId` (`demo_…`), persiste le message comme `QUEUED`, et retourne `{ success: true, mode: "demo" }`. L'utilisateur voit un succès alors que le message n'a jamais été envoyé.

- **Action :** retourner un échec explicite (`success: false`) quand SMPP échoue. Si un mode demo est vraiment voulu, le rendre explicite (flag env) et ne pas le mélanger avec la gestion d'erreur.

---

## 10. Aucun test

Le `package.json` déclare Vitest et Playwright, mais aucun fichier de test n'existe. Les chemins critiques (envoi SMPP, parsing DLR, rate limiter, crypto AES, auth guards, pipeline BullMQ) ne sont couverts par aucun test.

- **Priorité :** commencer par des tests unitaires pour :
  - `requiresUnicode` / `computeSegments` (facile, pur)
  - `parseDeliveryReceipt` / `extractMessageText` (parsing DLR, critique)
  - `encryptSecret` / `decryptSecret` (crypto roundtrip)
  - `normalizePhone` / `validateE164`
  - `SmppRateLimiter` (token bucket logic)

---

## 11. Endpoints SMPP sans authentification

Les routes `app/api/smpp/*` (`connect`, `disconnect`, `restart`, `status`, `state`, `query`) n'ont **aucune vérification d'identité** — ni Supabase session, ni API token. N'importe qui peut se connecter/déconnecter l'SMPP ou interroger l'état.

Le `middleware.ts` ne les exclut pas explicitement (seuls `api/auth/token` et `api/sms/send` sont exclus du matcher), donc le middleware Supabase tourne mais il ne fait que refresh la session — il ne bloque pas les requêtes non authentifiées aux routes API.

- **Action :** ajouter `orgGuard()` ou `requireRole("ADMIN")` dans chaque route handler SMPP.

---

## 12. `/api/smpp/connect` : `setTimeout(3000)` comme mécanisme d'attente

Le handler POST attend 3 secondes avec un `setTimeout` brut pour que le bind SMPP ait le temps de se faire, puis retourne l'état. C'est fragile (le bind peut prendre plus ou moins de temps).

- **Action :** utiliser `waitForBound()` (qui existe déjà dans `instance.ts`) avec un timeout configurable, ou retourner immédiatement et laisser le client poller `/api/smpp/status`.

---

## 13. `connectorSchema` dans `validations.ts` est un vestige

`core/lib/validations.ts` exporte un `connectorSchema` (host, port, systemId, password, etc.) mais il n'y a pas de modèle `SmppConnector` en DB (commentaire explicite dans `schema.prisma`). Le schéma n'est référencé nulle part.

- **Action :** supprimer `connectorSchema` et `ConnectorInput` de `validations.ts`.

---

## 14. Types fantômes dans `core/types/index.ts`

`core/types/index.ts` définit des interfaces (`Contact`, `SmsMessage`, `Campaign`, `SmppConnector`, `DashboardStats`, etc.) qui dupliquent ce que Prisma génère (`app/generated/prisma/client`). Elles sont utilisées par le store in-memory et quelques composants UI, mais divergent du schéma Prisma (noms de champs, casing, champs manquants).

- **Action :** après suppression du store in-memory, migrer les composants UI vers les types Prisma générés, puis supprimer les types manuels.

---

## 15. `scryptSync` bloque l'event loop

`core/lib/crypto/aes.ts` utilise `scryptSync` pour dériver la clé de chiffrement. `scrypt` est intentionnellement coûteux en CPU. Sur chaque appel à `encryptSecret` / `decryptSecret` (y compris dans le hot path), cela bloque le thread Node.js.

- **Action :** mettre en cache la clé dérivée en module-scope (elle ne change pas au runtime puisque l'env var est fixe) au lieu de la recalculer à chaque appel.

---

## 16. `SmsQueueCompat` (`core/lib/smpp/queue.ts`) — shim cassé

La méthode `enqueue()` lance `enqueueSms()` en fire-and-forget (`void`) et retourne `crypto.randomUUID()` avant que la promesse ne résolve, donc le `id` retourné n'est jamais le vrai `jobId`.

- **Action :** supprimer ce shim si aucun call site ne l'utilise encore (vérifier avec grep). Si des call sites existent, les migrer vers `enqueueSms()` directement.

---

## 17. `campaign-queue.ts` : N+1 queries dans le worker

La boucle `processChunk` exécute pour **chaque destinataire** :
1. `prisma.contact.findUnique` (blacklist check)
2. `prisma.smsMessage.create`
3. `enqueueSms` (qui fait aussi un `prisma.smsMessage.updateMany`)
4. `prisma.campaign.update` (increment counter)

Pour un chunk de 500 destinataires, c'est 2000+ requêtes DB séquentielles.

- **Action :** batch les vérifications de blacklist (`findMany` avec `IN`), utiliser `createMany` pour les messages, et incrémenter le compteur une seule fois à la fin du chunk.

---

## 18. Webhook secret stocké en clair dans le job

`webhooks-queue.ts` passe `secret` (le HMAC secret du webhook) dans le payload BullMQ (`WebhookDeliveryJob.secret`). Les jobs BullMQ sont sérialisés dans Redis — le secret est donc visible en clair dans Redis.

- **Action :** le worker devrait lire le secret depuis la DB au moment du traitement, pas le recevoir dans le job payload.

---

## 19. Pas de graceful shutdown

Aucun handler `SIGTERM`/`SIGINT` n'est enregistré pour :
- Fermer proprement les workers BullMQ (`worker.close()`)
- Unbind la session SMPP (`sessionManager.disconnectAll()`)
- Détruire le rate limiter (`destroyRateLimiter()`)
- Fermer Redis (`redis.quit()`)

En production (Vercel / Docker), un kill sans cleanup peut laisser des jobs BullMQ bloqués en `active` et des sessions SMPP orphelines sur le SMSC.

- **Action :** ajouter un module `core/lib/shutdown.ts` qui enregistre les handlers de signal et orchestre le cleanup dans le bon ordre.

---

## 20. `prisma.config.ts` — salt de dérivation hardcodé

`core/lib/crypto/aes.ts` utilise un salt fixe `"sms-gateway-pro-salt"` pour `scryptSync`. C'est acceptable si la clé d'entrée est forte, mais un salt par déploiement (stocké en env) serait plus robuste.
