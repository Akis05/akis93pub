# Configuration du Connecteur SMPP — `akis`

## Paramètres généraux

| Paramètre | Valeur |
|---|---|
| **Nom** | akis |
| **System ID** | akis |
| **Mot de passe** | •••• |
| **Type de compte** | Server |
| **Type de connexion** | TRX (ESME transmit & receive) |
| **Plage d'IP autorisée** | 0.0.0.0/0 |
| **Version du protocole** | SMPP 3.4 |
| **Profil de mappage d'erreur de réponse** | None |
| **Utiliser DataSm pour SMS sortant** | ☐ Non |
| **Supprimer le protocol ID SMS silencieux** | ☐ Non |
| **Mode de message entrant forcé** | Default |
| **Supprimer le mode transaction** | ☐ Non |
| **Forcer le mode transaction** | ☐ Non |
| **Supprimer le mode datagramme** | ☐ Non |
| **Validité maximale** | 7j 0h 0m 0s |
| **Validité par défaut** | 7j 0h 0m 0s |
| **Compte désactivé** | ☐ Non |
| **Mappage TLV entrant** | None |
| **Mode Message ID** | Hexadecimal |
| **Priorité de livraison** | Default |
| **Encodage intelligent** | ☐ Non |
| **Date de modification** | 23/06/26 14:49:10.636 EAT |

---

## Paramètres de contenu

### Encodage

| Paramètre | Valeur |
|---|---|
| **Auto-concaténation des entrants** | ☑ Oui |
| **Utiliser message_payload dans DeliverSm** | ☑ Oui |
| **Profil de mappage Data Coding Schema** | None |
| **Encodage sortant 7 bit** | SMSC default alphabet |
| **Profil sortant personnalisé 7 bit** | None |
| **Profil entrant personnalisé** | None |
| **Encodage sortant 8 bit binaire** | Unchanged |
| **Encodage sortant UCS2** | UCS2 |
| **Encodage des adresses** | ASCII String |
| **Mappage alphabet par défaut** | SMSC default alphabet |
| **Données entrantes en format 7-bit packed** | ☐ Non |
| **Profil DCS pour analyse 7-bit packed** | None |
| **Désactiver la concaténation de buffer** | Default |

---

## Paramètres de capacité

| Paramètre | Valeur |
|---|---|
| **Nombre de connexions** | 2 |
| **Capacité entrante** | 100 |
| **Capacité sortante** | 100 |
| **Requêtes simultanées max** | 1000 |

---

## Paramètres de rapport de livraison

| Paramètre | Valeur |
|---|---|
| **Accusé de réception** | Standard |
| **Encodage du reçu** | Latin-1 |
| **Inclure citation dans le reçu** | ☐ Non |
| **Longueur de la citation** | 20 |
| **Supprimer la demande de rapport de statut** | ☐ Non |
| **Supprimer la demande intermédiaire** | ☐ Non |
| **Forcer la demande de rapport de statut** | Off |
| **Mode rapport de livraison distant** | Normal DR, no ADR |
| **Taille du Message ID** | 32 |
| **Message ID en majuscules** | ☐ Non |
| **Fuseau horaire** | Apply default timezone |
| **Profil de mappage d'erreur de rapport** | None |
| **Format de date du rapport** | YYMMDDhhmm |
| **Utiliser adresse d'origine non modifiée** | ☐ Non |

---

## Minuteries (Timers)

| Paramètre | Valeur |
|---|---|
| **Délai de réponse (s)** | 30s |
| **Période de ping (s)** | 0h 1m 10s |
| **Période d'inactivité (s)** | 0h 2m 0s |

---

## Paramètres d'alarme et de journalisation

| Paramètre | Valeur |
|---|---|
| **Générer une alarme** | ☐ Non |
| **Activer le journal de liaison (bind log)** | ☐ Non |
| **Activer le journal de ping** | ☐ Non |

---

## Paramètres de file d'attente

| Paramètre | Valeur |
|---|---|
| **ID de file cache** | *(vide)* |
| **Nb max d'entrées dans la file cache ESME** | *(vide)* |
| **Désactiver la file cache ESME hors ligne** | ☐ Non |
| **Livraison directe forcée** | ☐ Non |
| **Mode de livraison directe** | Use settings from store |
| **Délai adaptatif pour la livraison** | ☐ Non |
