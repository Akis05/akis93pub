# Analyse démarrage plateforme (logs `pnpm dev`)

## Constat

Le seul vrai problème visible dans les logs, c'est le volume de `GET /api/smpp/status` (une requête toutes les ~0.5-1s en continu, sur toutes les pages, avec des temps de réponse de 500-900ms voire jusqu'à 5s). Le reste (compilation Turbopack, connexion SMPP, connexion Redis) est normal pour un `next dev`.

## Cause

1. **Polling non mutualisé** : `/api/smpp/status` est interrogé par un `setInterval(5000)` indépendant dans:
   - `core/components/layout/header.tsx` (`useSmppStatus`) — monté sur **toutes** les pages du dashboard.
   - `app/(dashboard)/sms/send/use-smpp-live-status.ts` (`useSmppLiveStatus`) — réutilisé séparément dans `send-sms-form.tsx`, `bulk-sms-form.tsx` et `send-sms-simple-tab.tsx`.

   Sur `/sms/send`, ça fait **jusqu'à 4 pollers indépendants** non synchronisés qui tapent le même endpoint, d'où l'impression de requêtes quasi continues.

2. **Chaque requête paie un aller-retour complet d'auth** alors qu'elle ne fait que lire un snapshot en mémoire (`sessionManager.snapshot()`). `requirePermission()` → `orgGuard()` fait à chaque appel :
   - `supabase.auth.getUser()` → appel réseau vers Supabase Auth (pas de vérification JWT locale),
   - `prisma.user.findUnique(...)` → aller-retour DB.

   C'est ça qui explique les 500-900ms (et pics à 5s) par requête, répétés en boucle par 1 à 4 composants selon la page.

## Pistes d'amélioration (par ordre d'impact)

1. **Mutualiser le polling** : un seul hook/contexte partagé (ex. React Context ou SWR avec une clé commune `"smpp-status"`) au lieu de 4 instances indépendantes de `useSmppLiveStatus`/`useSmppStatus`.
2. **Alléger l'auth sur cet endpoint précis** : passer `supabase.auth.getUser()` (réseau) à une vérification JWT locale (`getClaims()`/décodage local du access token) pour ce genre d'endpoint à fort polling, ou mettre en cache le résultat de `orgGuard()` quelques secondes par utilisateur.
3. **Augmenter l'intervalle** : 5s est agressif pour un simple indicateur de statut ; 10-15s suffit largement sans dégrader l'UX.
4. **Remplacer le polling par du push** : l'état SMPP change déjà via des events serveur (`SMPP session state changed` dans les logs) — un SSE/WebSocket éviterait le polling complètement.

Le reste (bind SMPP, worker BullMQ, connexion Redis) démarre correctement et n'a rien d'anormal.

## Résolu (point 1) avec Zustand

Ajout de `core/lib/smpp/smpp-status-store.ts` : un store Zustand global qui centralise le polling de `/api/smpp/status` avec un seul `setInterval` (10s) partagé par un compteur de `subscribers`, quel que soit le nombre de composants montés.

- `core/components/layout/header.tsx` (`useSmppStatus`) et `app/(dashboard)/sms/send/use-smpp-live-status.ts` (`useSmppLiveStatus`) lisent maintenant tous les deux ce store au lieu d'avoir chacun leur propre `setInterval`.
- Résultat : quel que soit le nombre de composants abonnés (header + 3 hooks sur `/sms/send`), une seule requête réseau toutes les 10s au lieu de jusqu'à 4 requêtes indépendantes toutes les 5s.

Points 2 (coût auth par requête) et 4 (push au lieu de polling) restent à faire si besoin.
