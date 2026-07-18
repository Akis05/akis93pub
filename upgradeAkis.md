# Upgrade Akis — Propositions d'amélioration SMS Gateway Pro

## 1. Design & UX

### 1.1 Dashboard (fait)
- Cartes KPI avec gradients colorés (bleu, vert, violet, orange) pour identifier visuellement chaque métrique
- Badges de statut colorés (vert = livré, rouge = échoué, jaune = en attente, violet = file d'attente)
- Indicateurs de tendance (+/-%) avec fond coloré vert/rouge
- Connecteur SMPP avec indicateur visuel (icône Wifi vert/rouge) dans le header
- Graphiques avec tooltips stylisés et légende colorée
- États vides avec icônes et messages d'aide

### 1.2 Thème & Cohérence visuelle
- Standardiser les coins arrondis (`rounded-xl` partout au lieu du mix `rounded-md`/`rounded-lg`)
- Ajouter un mode sombre complet avec des gradients adaptés (les KPI cards utilisent déjà `dark:shadow-*`)
- Ajouter des animations subtiles (transitions sur hover des cartes, skeleton loaders pendant le chargement)
- Harmoniser les tailles de texte et espacement entre toutes les pages

### 1.3 Pages à améliorer
- **SMS History / Queue** : ajouter des badges colorés par statut sur chaque ligne (comme le dashboard)
- **Contacts** : ajouter un indicateur visuel pour les contacts blacklistés (rouge) vs actifs (vert)
- **Campagnes** : ajouter une barre de progression colorée par campagne + badge statut
- **Billing** : ajouter des graphiques de consommation (courbe mensuelle, breakdown par campagne)
- **Connectors** : transformer la page statique en une vue avec indicateurs temps réel

---

## 2. Gestion du compte SMPP

### 2.1 Problème actuel
- Un seul connecteur SMPP configuré via variables d'environnement (`SMPP_HOST`, `SMPP_SYSTEM_ID`, etc.)
- Pas de modèle DB pour les connecteurs — tout est en mémoire
- La page `/connectors` est en lecture seule
- Le `SessionManager` supporte déjà plusieurs clés mais seule `__env__` est utilisée

### 2.2 Propositions

 
#### Monitoring SMPP avancé (priorité moyenne)
- Dashboard temps réel : TPS actuel, latence submit_sm, taux d'erreur par connecteur
- Historique des (dé)connexions avec timestamps (exploiter `lastConnectedAt`/`lastDisconnectedAt`)
- Alertes externes : intégrer Slack/email au lieu du `logger.fatal` actuel
- Graphique de la fenêtre de throughput (messages/seconde sur les dernières 24h)

---

## 3. Implémentations manquantes critiques

### 3.1 Déduction automatique des crédits (priorité critique)
**Problème** : `CreditBalance`, `CreditTransaction` et `PricingRule` existent en DB mais ne sont jamais utilisés dans le pipeline d'envoi. Les crédits ne sont modifiés que manuellement.

**Solution** :
- Dans le worker SMS (`sms-queue.ts`), après un envoi réussi :
  1. Chercher le `PricingRule` applicable (par pays/préfixe)
  2. Calculer le coût (segments × prix par segment)
  3. Appeler `applyTransaction()` pour débiter
  4. Mettre à jour `SmsMessage.cost`
- Vérifier le solde AVANT d'envoyer — rejeter si insuffisant
- Émettre une alerte `CREDITS_LOW` quand le seuil est atteint

### 3.2 Rate limiting API (priorité haute)
**Problème** : `ApiKey.rateLimit` (défaut 100 req/min) et `ApiKey.ipWhitelist` existent en DB mais ne sont jamais vérifiés. `@upstash/ratelimit` est installé mais inutilisé.

**Solution** :
- Dans `authenticateRequest()` ou en middleware de route :
  1. Vérifier l'IP contre `ipWhitelist` (si défini)
  2. Appliquer le rate limit avec `@upstash/ratelimit` (sliding window)
  3. Retourner 429 avec `Retry-After` header si dépassé

### 3.3 Dispatch des webhooks (priorité haute)
**Problème** : `dispatchEvent()` est entièrement codé (queue BullMQ, HMAC signing, retry, persistance) mais n'est jamais appelé depuis le pipeline SMS/DLR/campagne.

**Solution** — ajouter des appels à `dispatchEvent()` dans :
- `sms-queue.ts` worker : événements `sms.sent` / `sms.failed`
- `wire-delivery-receipts.ts` : événement `sms.delivered` sur DLR final
- `campaign-queue.ts` : événements `campaign.started` / `campaign.completed`
- `wire-delivery-receipts.ts` (opt-out) : événement `contact.opt_out`

### 3.4 Substitution de variables dans les templates (priorité moyenne)
**Problème** : Les templates stockent `{{variable}}` mais aucun moteur de rendu ne remplace par les données du contact.

**Solution** :
- Créer `core/lib/template-engine.ts` avec une fonction `renderTemplate(content, contact)`
- Remplacer `{{firstName}}`, `{{lastName}}`, `{{phone}}`, `{{customFields.*}}`
- Intégrer dans `campaign-queue.ts` lors de la création des `SmsMessage`

### 3.5 Scopes des clés API (priorité moyenne)
**Problème** : `ApiKey.scopes` existe (défaut `["sms:send", "sms:read"]`) mais `authenticateRequest()` ne vérifie pas si le scope requis est dans la liste.

**Solution** :
- Modifier `authenticateRequest()` pour accepter un paramètre `requiredScope`
- Vérifier `apiKey.scopes.includes(requiredScope)` et retourner 403 si manquant

---

## 4. Sécurité

### 4.1 Faille d'isolation multi-tenant dans les templates (priorité critique)
**Problème** : `updateTemplateAction()` et `deleteTemplateAction()` dans `core/actions/templates.ts` opèrent par `id` seul sans filtre `organizationId`. Un utilisateur pourrait modifier/supprimer les templates d'une autre organisation.

**Correction** :
```ts
// Ajouter dans updateTemplateAction et deleteTemplateAction :
const existing = await prisma.smsTemplate.findFirst({
  where: { id, organizationId: ctx.organizationId, deletedAt: null }
});
if (!existing) throw new Error("Template introuvable");
```

### 4.2 Chiffrement des secrets SMPP (priorité haute)
**Problème** : Les mots de passe SMPP et secrets webhook sont stockés en clair en DB. Le module AES (`core/lib/crypto/aes.ts`) existe mais n'est pas utilisé.

**Solution** : Chiffrer avec AES-256-GCM avant stockage, déchiffrer à l'utilisation.

### 4.3 Endpoint de santé (priorité moyenne)
Créer `GET /api/health` retournant :
```json
{
  "status": "healthy",
  "smpp": "bound",
  "redis": "connected",
  "database": "connected",
  "uptime": 3600
}
```

---

## 5. Observabilité

### 5.1 Sentry (priorité haute)
`@sentry/nextjs` est installé mais jamais configuré. Créer :
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- Configurer `SENTRY_DSN` depuis `.env`

### 5.2 Alertes externes (priorité moyenne)
Remplacer `logger.fatal` dans `core/lib/smpp/alerts.ts` par :
- Notification Slack (webhook URL configurable)
- Email via Resend (déjà intégré pour les invitations)
- Notification in-app (modèle `Notification` déjà en DB)

### 5.3 Worker de rapports planifiés (priorité basse)
La queue BullMQ `scheduled-reports` est définie mais aucun worker ne traite les jobs. Implémenter le worker pour générer les rapports CSV/PDF automatiquement.

---

## 6. Roadmap suggérée

| Phase | Tâches | Priorité |
|-------|--------|----------|
| **P0 — Sécurité** | Fix isolation templates, chiffrement secrets | Critique |
| **P1 — Pipeline complet** | Déduction crédits, rate limiting API, dispatch webhooks | Haute |
| **P2 — SMPP multi-compte** | Modèle DB connecteurs, UI CRUD, routage intelligent | Haute |
| **P3 — Observabilité** | Config Sentry, alertes Slack/email, endpoint /health | Moyenne |
| **P4 — Fonctionnalités** | Template engine, scopes API, worker rapports planifiés | Moyenne |
| **P5 — UX** | Refonte pages history/queue/contacts, animations, skeleton loaders | Basse |
