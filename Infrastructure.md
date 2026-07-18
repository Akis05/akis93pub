# Infrastructure — SMS Gateway Pro : Vercel + VPS

Guide etape par etape pour deployer **SMS Gateway Pro** en production :

- **Next.js** (dashboard, API) → **Vercel** (deploiement automatique, HTTPS, CDN).
- **smpp-bridge** (session SMPP, workers BullMQ, Redis) → **VPS** Ubuntu 24.04 avec Docker.

Le SMSC est accessible uniquement depuis votre machine locale — un **tunnel Cloudflare** achemine le trafic SMPP (TCP) depuis le VPS vers votre machine.

> **Niveau requis** : debutant en administration serveur. Chaque commande est copiable telle quelle.

---

## Table des matieres

0. [Architecture](#0-architecture)
1. [Prerequis](#1-prerequis)
2. [Securiser le VPS](#2-securiser-le-vps)
3. [Installer Docker et Nginx](#3-installer-docker-et-nginx)
4. [Configurer le tunnel Cloudflare](#4-configurer-le-tunnel-cloudflare)
5. [Cloner le projet sur le VPS](#5-cloner-le-projet-sur-le-vps)
6. [Variables d'environnement (VPS)](#6-variables-denvironnement-vps)
7. [Construire et demarrer (Docker Compose)](#7-construire-et-demarrer-docker-compose)
8. [Configurer Nginx (reverse proxy vers le bridge)](#8-configurer-nginx-reverse-proxy-vers-le-bridge)
9. [Activer HTTPS avec Let's Encrypt](#9-activer-https-avec-lets-encrypt)
10. [Deployer Next.js sur Vercel](#10-deployer-nextjs-sur-vercel)
11. [Verification de bout en bout](#11-verification-de-bout-en-bout)
12. [Maintenance](#12-maintenance)
13. [Depannage](#13-depannage)
14. [Checklist securite](#14-checklist-securite)

---

## 0. Architecture

```
Navigateur ── HTTPS ──► Vercel (Next.js)
                            │
                            │ BRIDGE_URL (HTTPS)
                            ▼
                     Nginx (:443) ── VPS ──────────────────────┐
                            │                                   │
                       proxy_pass                               │
                            │                                   │
               ┌─── Docker Compose ────────────────────────┐   │
               │            ▼                               │   │
               │   smpp-bridge (:3001)                      │   │
               │       │           │                        │   │
               │       ▼           ▼                        │   │
               │   Redis (:6379)   cloudflared (:2775)      │   │
               │                       │                    │   │
               └───────────────────────┼────────────────────┘   │
                                       │                        │
                                  Cloudflare Edge               │
                                       │                        │
                             Machine locale (Windows)           │
                             cloudflared (service)              │
                                       │                        │
                                       ▼                        │
                                     SMSC                       │
                                                                │
└───────────────────────────────────────────────────────────────┘
```

**Vercel** heberge Next.js (dashboard, Server Actions, API publique). Aucun serveur a gerer — Vercel s'occupe du build, du HTTPS, du CDN et du scaling.

**Trois conteneurs Docker** tournent sur le VPS :

| Conteneur      | Role                                              | Port expose |
|----------------|---------------------------------------------------|-------------|
| `smpp-bridge`  | Session SMPP + workers BullMQ                     | 127.0.0.1:3001 (vers Nginx) |
| `redis`        | File d'attente BullMQ                             | aucun (reseau Docker uniquement) |
| `cloudflared`  | Client TCP tunnel vers le SMSC via Cloudflare     | aucun (reseau Docker uniquement) |

**Nginx** tourne nativement sur le VPS (pas dans Docker) pour exposer le bridge en HTTPS. Vercel appelle `https://bridge.votredomaine.com` pour envoyer des SMS, lancer des campagnes, etc.

**Sur votre machine locale (Windows)** : `cloudflared` tourne en tant que service Windows et maintient le tunnel vers le SMSC 24h/24.

> **Important** : votre machine locale doit rester allumee et connectee pour que le tunnel SMSC fonctionne. Si elle s'eteint, le bridge perd l'acces au SMSC. A long terme, demandez a votre operateur SMSC d'autoriser l'IP du VPS directement — vous pourrez alors supprimer le tunnel et connecter le bridge directement au SMSC.

### Pourquoi cette architecture ?

- **Next.js sur Vercel** : deploiement automatique a chaque `git push`, HTTPS gratuit, CDN mondial, zero maintenance serveur. Vercel est specialement concu pour Next.js.
- **smpp-bridge sur VPS** : le bridge maintient une connexion SMPP (TCP) permanente et des workers BullMQ — impossible sur une plateforme serverless comme Vercel. Un petit VPS suffit car il ne sert que le bridge (pas le build Next.js).
- **VPS plus leger** : sans Next.js a builder/servir, le VPS n'a besoin que de ~500 Mo de RAM en fonctionnement. Le build Docker est aussi beaucoup plus rapide et leger.

---

## 1. Prerequis

Avant de commencer, assurez-vous d'avoir :

- Un **VPS** Ubuntu 24.04 LTS 64 bits, avec l'utilisateur `ubuntu` et l'acces `sudo`.

> **Note pour un petit VPS (1 CPU / 2 Go RAM / 20 Go disque)** : cette architecture est ideale pour un petit VPS car seul le bridge tourne dessus (pas Next.js). Le swap (etape 2.4) reste **obligatoire** avec 2 Go de RAM — le build Docker du bridge est leger, mais le systeme a besoin de marge. Surveillez l'espace disque regulierement (`df -h`).

- Un **nom de domaine** (ex : `votredomaine.com`) gere par Cloudflare (nameservers pointant vers Cloudflare).
- Un **compte Cloudflare** (gratuit) avec votre domaine ajoute.
- Un **compte Vercel** (gratuit) connecte a votre depot Git (GitHub/GitLab/Bitbucket).
- Un **compte GitHub** (ou GitLab/Bitbucket) avec le code source pousse.
- Vos identifiants **Supabase** (URL, anon key, `DATABASE_URL`).
- Les parametres de connexion au **SMSC** (host, port, system ID, mot de passe).
- Un client SSH (Windows Terminal ou PuTTY).

**DNS a configurer maintenant** (dans le dashboard Cloudflare, section DNS) :

| Type    | Nom      | Valeur                           | Proxy |
|---------|----------|----------------------------------|-------|
| `A`     | `bridge` | `IP_PUBLIQUE_DU_VPS`             | Desactive (DNS only, nuage gris) |

> Le sous-domaine `bridge.votredomaine.com` pointe vers le VPS pour exposer le bridge. Desactivez le proxy Cloudflare (nuage gris) pour que Certbot puisse valider le certificat. Le domaine principal pour l'app (ex : `sms.votredomaine.com`) sera configure dans Vercel a l'etape 10.

---

## 2. Securiser le VPS

Connectez-vous en SSH :

```bash
ssh ubuntu@IP_DU_VPS
```

### 2.1 Mettre a jour le systeme

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 Configurer le pare-feu

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Repondez `y` a la confirmation. Verifiez :

```bash
sudo ufw status
```

Seuls les ports 22, 80 et 443 doivent etre autorises. Docker gere ses propres regles reseau en interne — les conteneurs communiquent entre eux sans passer par ufw.

### 2.3 Installer fail2ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 2.4 Ajouter un fichier swap

**Obligatoire avec 2 Go de RAM ou moins.** Docker et le bridge consomment de la memoire — sans swap, le systeme peut planter sous charge (`Killed`, `ENOMEM`).

Avec 2 Go de RAM, prevoyez **4 Go de swap** (deux fois la RAM) :

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Verifiez :

```bash
free -h
```

Vous devez voir `4.0Gi` sur la ligne `Swap`.

---

## 3. Installer Docker et Nginx

### 3.1 Docker Engine + Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
newgrp docker
```

Verifiez :

```bash
docker --version
docker compose version
```

### 3.2 Nginx + Certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
```

### 3.3 Git

```bash
sudo apt install -y git
```

---

## 4. Configurer le tunnel Cloudflare

Cette section configure un tunnel TCP Cloudflare pour que le smpp-bridge (sur le VPS) puisse atteindre le SMSC (accessible uniquement depuis votre machine locale).

Le tunnel fonctionne en deux parties :
- **Machine locale** : `cloudflared` ouvre une connexion sortante vers Cloudflare et expose le SMSC.
- **VPS** : `cloudflared` (dans Docker) se connecte a Cloudflare pour atteindre le SMSC via le tunnel.

### 4.1 Creer le tunnel (dashboard Cloudflare)

1. Allez sur [https://one.dash.cloudflare.com](https://one.dash.cloudflare.com) (Cloudflare Zero Trust).
2. Creez un compte Zero Trust si c'est la premiere fois (le plan gratuit suffit).
3. Dans le menu de gauche : **Networks** → **Tunnels**.
4. Cliquez **Create a tunnel**.
5. Selectionnez **Cloudflared** comme type de connecteur.
6. Nommez le tunnel : `smsc-tunnel`, puis cliquez **Save tunnel**.
7. **Gardez cette page ouverte** — elle affiche un jeton d'installation (token) necessaire a l'etape 4.2.

### 4.2 Installer cloudflared sur votre machine locale (Windows)

Sur votre **machine locale** (celle qui peut joindre le SMSC) :

**Option A — winget (recommande)** :

```powershell
winget install Cloudflare.cloudflared
```

**Option B — telechargement direct** :

Telechargez `cloudflared-windows-amd64.msi` depuis [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases/latest) et installez-le.

Ensuite, ouvrez **PowerShell en tant qu'Administrateur** et installez le tunnel en tant que service Windows avec le jeton affiche a l'etape 4.1 :

```powershell
cloudflared service install <TOKEN_AFFICHE_DANS_LE_DASHBOARD>
```

> Le `<TOKEN>` est une longue chaine affichee dans la page de creation du tunnel (section "Install and run a connector"). Copiez-collez la commande complete affichee par Cloudflare.

Verifiez que le service tourne :

```powershell
Get-Service -Name "Cloudflared"
```

Le statut doit etre `Running`. Le service demarre automatiquement au boot de Windows.

### 4.3 Configurer le hostname du tunnel (SMSC)

Retournez dans le dashboard Cloudflare (la page de creation du tunnel) :

1. La page doit maintenant montrer votre connecteur comme **Connected**.
2. Cliquez **Next** pour arriver a la section **Route tunnel**.
3. Configurez le **Public Hostname** :
   - **Subdomain** : `smsc`
   - **Domain** : selectionnez votre domaine
   - **Path** : laissez vide
   - **Type** : `TCP`
   - **URL** : `10.76.5.228:3600` (l'adresse du SMSC telle que vous l'utilisez localement)
4. Cliquez **Save tunnel**.

Cloudflare cree automatiquement un enregistrement DNS CNAME pour `smsc.votredomaine.com`. Ce hostname n'est **pas** accessible directement dans un navigateur — il sert uniquement au tunnel TCP.

### 4.4 Creer un jeton de service (Access)

Le jeton de service permet au conteneur `cloudflared` sur le VPS de s'authentifier aupres de Cloudflare sans intervention humaine.

1. Dans le dashboard Zero Trust : **Access** → **Service Auth** → **Service Tokens**.
2. Cliquez **Create Service Token**.
3. Nommez-le : `vps-bridge`.
4. Cliquez **Create Service Token**.
5. **Copiez immediatement** le `Client ID` et le `Client Secret` — le secret ne sera plus affiche.

### 4.5 Creer une politique d'acces

1. **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. **Application name** : `SMSC Tunnel`
3. **Session Duration** : `24 hours`
4. **Application domain** : `smsc.votredomaine.com`
5. Cliquez **Next**.
6. **Policy name** : `Service Token`
7. **Action** : `Service Auth`
8. **Include** : selectionnez `Service Token`, puis choisissez le jeton `vps-bridge` cree a l'etape 4.4.
9. Cliquez **Next** → **Add application**.

### 4.6 Tester le tunnel (optionnel)

Depuis votre machine locale, verifiez que le SMSC est bien joignable :

```powershell
Test-NetConnection -ComputerName 10.76.5.228 -Port 3600
```

Le `TcpTestSucceeded` doit etre `True`. Si ce test echoue, le tunnel ne fonctionnera pas non plus — corrigez d'abord la connectivite locale vers le SMSC.

---

## 5. Cloner le projet sur le VPS

De retour sur le VPS (SSH) :

```bash
cd ~
git clone <URL_DE_VOTRE_REPO> akis93
cd akis93
```

### 5.1 Corriger pnpm-workspace.yaml

Le fichier `pnpm-workspace.yaml` contient un placeholder qui doit etre corrige avant le build Docker :

```bash
sed -i 's/unrs-resolver: set this to true or false/unrs-resolver: true/' pnpm-workspace.yaml
```

Verifiez :

```bash
cat pnpm-workspace.yaml
```

La ligne doit afficher `unrs-resolver: true`.

---

## 6. Variables d'environnement (VPS)

Il n'y a pas de fichier `.env.example` dans ce depot. Les fichiers `.env` doivent etre crees manuellement sur le VPS.

> Les variables Next.js (Supabase, BRIDGE_URL, etc.) seront configurees dans le dashboard Vercel a l'etape 10 — pas dans un fichier sur le VPS.

### 6.1 Generer une cle API partagee (BRIDGE_API_KEY)

Cette cle est un secret partage entre Next.js (Vercel) et le bridge (VPS). Generez-la une seule fois :

```bash
openssl rand -hex 32
```

Copiez la valeur — elle sera utilisee dans le `.env` du bridge **et** dans les variables Vercel.

### 6.2 Fichier smpp-bridge/.env

```bash
nano ~/akis93/smpp-bridge/.env
```

Collez et adaptez :

```bash
# --- Bridge ---
BRIDGE_PORT=3001
BRIDGE_API_KEY=<cle_generee_etape_6.1>
NODE_ENV=production

# --- Base de donnees (Supabase) ---
DATABASE_URL="postgresql://postgres.XXXX:MOTDEPASSE@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"

# --- SMPP ---
# SMPP_HOST et SMPP_PORT pointent vers le conteneur cloudflared (tunnel)
# PAS vers l'adresse reelle du SMSC
SMPP_HOST=cloudflared
SMPP_PORT=2775
# Les identifiants restent ceux de votre operateur SMSC
SMPP_SYSTEM_ID=<votre_system_id>
SMPP_PASSWORD=<votre_mot_de_passe>
SMPP_SYSTEM_TYPE=
SMPP_SOURCE_ADDR=<adresse_source>
SMPP_ADDR_TON=5
SMPP_ADDR_NPI=0
SMPP_BIND_MODE=transceiver
SMPP_ENQUIRE_LINK_INTERVAL_MS=30000
SMPP_RECONNECT_DELAY_MS=5000
SMPP_RECONNECT_MAX_DELAY_MS=60000
SMPP_SUBMIT_TIMEOUT_MS=10000
SMPP_USE_TLS=false
SMPP_ENABLE_QUERY_SM=false
SMPP_MAX_TPS=30

# --- Redis (nom du service Docker, pas 127.0.0.1) ---
REDIS_URL=redis://redis:6379

# --- Workers ---
SMS_WORKER_CONCURRENCY=10
CAMPAIGN_WORKER_CONCURRENCY=4
WEBHOOKS_WORKER_CONCURRENCY=5

# --- Logs ---
LOG_LEVEL=info
```

> **Point cle** : `SMPP_HOST=cloudflared` et `SMPP_PORT=2775` — le bridge se connecte au conteneur `cloudflared`, qui route le trafic via le tunnel Cloudflare vers votre machine locale, qui atteint le SMSC.

### 6.3 Fichier .env (racine, pour Docker Compose)

Ce fichier est lu par Docker Compose pour les variables du conteneur `cloudflared` :

```bash
nano ~/akis93/.env
```

Collez et adaptez :

```bash
# --- Cloudflare Tunnel (utilise par docker-compose.yml) ---
CF_TUNNEL_HOSTNAME=smsc.votredomaine.com
CF_ACCESS_CLIENT_ID=<client_id_du_jeton_de_service>
CF_ACCESS_CLIENT_SECRET=<client_secret_du_jeton_de_service>
```

### 6.4 Proteger les fichiers

```bash
chmod 600 ~/akis93/.env ~/akis93/smpp-bridge/.env
```

---

## 7. Construire et demarrer (Docker Compose)

### 7.1 Comprendre les fichiers Docker

Le VPS n'a besoin que de deux fichiers Docker :

| Fichier                    | Role                                                       |
|----------------------------|-------------------------------------------------------------|
| `smpp-bridge/Dockerfile`   | Image smpp-bridge (Node.js + tsx)                           |
| `docker-compose.yml`       | Orchestre les 3 conteneurs (bridge + Redis + cloudflared)   |

> Le `Dockerfile` a la racine (pour Next.js) n'est pas utilise ici — Next.js est deploye sur Vercel.

### 7.2 Construire l'image du bridge

La premiere construction prend 2 a 5 minutes :

```bash
cd ~/akis93
docker compose build
```

### 7.3 Demarrer les services

```bash
docker compose up -d
```

L'option `-d` lance les conteneurs en arriere-plan. Docker les redemarre automatiquement en cas de crash ou de reboot du serveur (grace a `restart: unless-stopped`).

### 7.4 Verifier que tout tourne

```bash
docker compose ps
```

Les 3 conteneurs doivent etre `Up` (ou `healthy` pour ceux qui ont un healthcheck) :

```
NAME            STATUS
cloudflared     Up
redis           Up (healthy)
smpp-bridge     Up (healthy)
```

Verifiez le bridge :

```bash
curl -s http://localhost:3001/health | python3 -m json.tool
```

Reponse attendue : `"status": "healthy"`, `"smpp": {"state": "bound"}`, `"redis": {"connected": true}`.

Si le SMPP state est `"closed"` ou `"connecting"`, verifiez :
1. Que votre machine locale est allumee et le service `Cloudflared` y tourne.
2. Que le tunnel est **Connected** dans le dashboard Cloudflare (Networks → Tunnels).
3. Que les identifiants SMSC dans `smpp-bridge/.env` sont corrects.

### 7.5 Demarrage automatique au reboot

Docker redemarre automatiquement les conteneurs grace a `restart: unless-stopped`. Verifiez que Docker demarre au boot :

```bash
sudo systemctl enable docker
```

---

## 8. Configurer Nginx (reverse proxy vers le bridge)

Nginx expose le bridge en HTTPS pour que Vercel puisse l'atteindre. Seul le bridge est proxifie — Redis et cloudflared restent internes.

### 8.1 Creer la configuration

```bash
sudo nano /etc/nginx/sites-available/bridge
```

Collez (remplacez `bridge.votredomaine.com`) :

```nginx
server {
    listen 80;
    server_name bridge.votredomaine.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Bloquer l'acces au endpoint /health depuis Internet (usage interne uniquement)
    location /health {
        deny all;
        return 403;
    }
}
```

### 8.2 Activer le site

```bash
sudo ln -s /etc/nginx/sites-available/bridge /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
```

### 8.3 Tester et recharger

```bash
sudo nginx -t
```

Si le test affiche `syntax is ok` :

```bash
sudo systemctl reload nginx
```

### 8.4 Verifier l'acces HTTP

Depuis le VPS :

```bash
curl -I http://bridge.votredomaine.com
```

Vous devriez obtenir une reponse HTTP 401 (le bridge rejette les requetes sans `BRIDGE_API_KEY` — c'est normal et attendu).

---

## 9. Activer HTTPS avec Let's Encrypt

```bash
sudo certbot --nginx -d bridge.votredomaine.com
```

Certbot :
1. Vous demande votre email (pour les rappels d'expiration).
2. Obtient un certificat SSL automatiquement.
3. Modifie la configuration Nginx pour rediriger HTTP → HTTPS.

Verifiez :

```bash
curl -I https://bridge.votredomaine.com
```

Reponse attendue : `HTTP/2 401` (pas de token = rejete, c'est correct).

Le renouvellement automatique est deja configure. Testez :

```bash
sudo certbot renew --dry-run
```

---

## 10. Deployer Next.js sur Vercel

### 10.1 Importer le projet

1. Allez sur [vercel.com](https://vercel.com) et connectez-vous.
2. Cliquez **Add New** → **Project**.
3. Importez votre depot Git (GitHub/GitLab/Bitbucket).
4. Vercel detecte automatiquement Next.js — laissez les parametres par defaut.
5. **Ne cliquez pas encore sur Deploy** — configurez d'abord les variables d'environnement.

### 10.2 Variables d'environnement

Dans les parametres du projet Vercel, ajoutez ces variables (section **Environment Variables**) :

```bash
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# --- Base de donnees ---
DATABASE_URL="postgresql://postgres.XXXX:MOTDEPASSE@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.XXXX:MOTDEPASSE@aws-0-eu-west-2.pooler.supabase.com:5432/postgres"

# --- Bridge (pointe vers le VPS) ---
BRIDGE_URL=https://bridge.votredomaine.com
BRIDGE_API_KEY=<meme_cle_que_smpp-bridge/.env_sur_le_vps>

# --- App ---
NEXT_PUBLIC_APP_URL=https://sms.votredomaine.com

# --- Email (invitations utilisateurs) ---
RESEND_API_KEY=re_XXXX

# --- SMPP (lecture seule, pour l'affichage dans le dashboard) ---
SMPP_HOST=10.76.5.228
SMPP_PORT=3600
SMPP_SYSTEM_ID=<votre_system_id>
SMPP_PASSWORD=<votre_mot_de_passe>
SMPP_SYSTEM_TYPE=
SMPP_SOURCE_ADDR=<adresse_source>
SMPP_BIND_MODE=transceiver
SMPP_USE_TLS=false
SMPP_ENQUIRE_LINK_INTERVAL_MS=30000
```

> **BRIDGE_URL** pointe vers `https://bridge.votredomaine.com` — c'est le bridge sur votre VPS, expose via Nginx + HTTPS (etapes 8-9). La `BRIDGE_API_KEY` doit etre **identique** a celle dans `smpp-bridge/.env` sur le VPS.

> **SMPP_HOST/PORT** : ici, mettez les valeurs **reelles** du SMSC (`10.76.5.228:3600`), pas `cloudflared:2775`. Ces valeurs sont uniquement lues pour l'affichage dans le dashboard (connecteur ".env").

### 10.3 Deployer

Cliquez **Deploy**. Vercel build et deploie automatiquement. Le premier build prend 2 a 5 minutes.

### 10.4 Configurer le domaine personnalise

1. Dans les parametres du projet Vercel : **Settings** → **Domains**.
2. Ajoutez `sms.votredomaine.com` (ou le domaine de votre choix).
3. Vercel vous indique un enregistrement DNS a ajouter. Dans le dashboard Cloudflare (section DNS), ajoutez :

| Type    | Nom   | Valeur                           | Proxy |
|---------|-------|----------------------------------|-------|
| `CNAME` | `sms` | `cname.vercel-dns.com`           | Desactive (DNS only, nuage gris) |

> **Desactivez le proxy Cloudflare** (nuage gris) pour le domaine Vercel — Vercel gere son propre HTTPS et CDN. Le proxy Cloudflare peut causer des boucles de redirection.

4. Attendez quelques minutes que le DNS se propage. Vercel genere automatiquement un certificat HTTPS.

### 10.5 Deploiements automatiques

A chaque `git push` sur la branche principale, Vercel redeploit automatiquement. Aucune action manuelle necessaire.

---

## 11. Verification de bout en bout

### 11.1 Sante du bridge (depuis le VPS)

```bash
curl -s http://localhost:3001/health | python3 -m json.tool
```

Verifiez : `status` = `healthy`, `smpp.state` = `bound`, `redis.connected` = `true`.

### 11.2 Connexion Vercel → Bridge

Depuis votre machine locale, testez que Vercel peut joindre le bridge :

```bash
curl -s -H "Authorization: Bearer <VOTRE_BRIDGE_API_KEY>" https://bridge.votredomaine.com/health
```

Reponse attendue : `"status": "healthy"`.

### 11.3 Dashboard

Ouvrez `https://sms.votredomaine.com` dans votre navigateur. Connectez-vous avec votre compte Supabase.

### 11.4 Envoi SMS de test via le dashboard

Envoyez un SMS de test. Surveillez les logs en parallele sur le VPS :

```bash
docker compose logs -f smpp-bridge
```

Vous devriez voir le `submit_sm` partir et le statut passer a `SENT` puis `DELIVERED`.

### 11.5 Envoi SMS via l'API

```bash
curl -X POST https://sms.votredomaine.com/api/sms/send \
  -H "Authorization: Bearer sgp_VOTRE_CLE_API" \
  -H "Content-Type: application/json" \
  -d '{"to":"+2536XXXXXXXX","text":"Test production"}'
```

---

## 12. Maintenance

### 12.1 Consulter les logs

**Bridge (VPS)** :

```bash
# Logs en direct (tous les conteneurs)
docker compose logs -f

# Logs d'un seul conteneur
docker compose logs -f smpp-bridge

# 100 dernieres lignes
docker compose logs --tail 100 smpp-bridge

# Logs du tunnel
docker compose logs -f cloudflared
```

**Next.js (Vercel)** : consultez les logs dans le dashboard Vercel → votre projet → **Logs**.

### 12.2 Redemarrer le bridge

```bash
# Redemarrer un conteneur
docker compose restart smpp-bridge

# Redemarrer tous les conteneurs
docker compose restart

# Arreter et relancer tout
docker compose down
docker compose up -d
```

### 12.3 Mettre a jour l'application

**Bridge (VPS)** :

```bash
cd ~/akis93
git pull
docker compose build
docker compose up -d
```

**Next.js (Vercel)** : un simple `git push` suffit — Vercel redeploit automatiquement.

### 12.4 Migration de base de donnees

Les migrations Prisma peuvent etre executees depuis le VPS avec un conteneur temporaire :

```bash
cd ~/akis93
docker compose run --rm smpp-bridge npx prisma migrate deploy --schema=/app/prisma/schema.prisma
```

Ou, si vous avez Node.js installe sur le VPS :

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@latest --activate

cd ~/akis93
pnpm install
pnpm db:migrate
```

Apres une migration, reconstruisez le bridge :

```bash
docker compose build smpp-bridge
docker compose up -d smpp-bridge
```

> La migration met a jour le schema de la base Supabase — Vercel n'a pas besoin d'etre redeploy pour une migration, sauf si le schema Prisma genere a change (auquel cas, poussez le code mis a jour et Vercel redeploit automatiquement).

### 12.5 Rollback

**Bridge** :

```bash
cd ~/akis93
git log --oneline -10
git checkout <hash>
docker compose build
docker compose up -d
git checkout main
```

**Next.js** : dans le dashboard Vercel → **Deployments** → cliquez sur un deploiement precedent → **Promote to Production**.

### 12.6 Nettoyage Docker

```bash
docker image prune -f
docker system prune -f
```

### 12.7 Mettre a jour le systeme

```bash
sudo apt update && sudo apt upgrade -y
```

Apres un upgrade du noyau :

```bash
sudo reboot
```

Docker redemarre automatiquement les conteneurs apres le reboot.

### 12.8 Surveiller les ressources

```bash
docker stats
df -h
free -h
```

---

## 13. Depannage

### Le bridge affiche `smpp.state: "closed"`

Le bridge ne peut pas se connecter au SMSC via le tunnel. Verifiez dans l'ordre :

1. **Machine locale allumee ?** Le service `Cloudflared` doit tourner sur votre machine Windows :
   ```powershell
   Get-Service -Name "Cloudflared"
   ```
2. **Tunnel connecte ?** Dashboard Cloudflare → Networks → Tunnels → votre tunnel doit etre **Connected**.
3. **SMSC joignable depuis la machine locale ?**
   ```powershell
   Test-NetConnection -ComputerName 10.76.5.228 -Port 3600
   ```
4. **Identifiants SMSC corrects ?** Verifiez `SMPP_SYSTEM_ID`, `SMPP_PASSWORD` dans `smpp-bridge/.env`.
5. **Jeton de service valide ?** Verifiez `CF_ACCESS_CLIENT_ID` et `CF_ACCESS_CLIENT_SECRET` dans `.env`.

```bash
docker compose logs cloudflared
```

### Le dashboard affiche "Bridge unreachable" ou erreur 500

Vercel ne peut pas joindre le bridge. Verifiez :

1. **Bridge tourne ?** Sur le VPS :
   ```bash
   docker compose ps smpp-bridge
   curl -s http://localhost:3001/health
   ```
2. **Nginx tourne ?**
   ```bash
   sudo systemctl status nginx
   ```
3. **HTTPS valide ?**
   ```bash
   curl -I https://bridge.votredomaine.com
   ```
4. **BRIDGE_URL correct dans Vercel ?** Doit etre `https://bridge.votredomaine.com` (avec `https://`, pas `http://`).
5. **BRIDGE_API_KEY identique ?** Comparez la valeur dans Vercel et dans `smpp-bridge/.env` sur le VPS.

### Redis `ECONNREFUSED`

```bash
docker compose ps redis
docker compose logs redis
```

Verifiez que `REDIS_URL=redis://redis:6379` (pas `127.0.0.1`) dans `smpp-bridge/.env`.

### Le build Docker echoue

```bash
docker compose build --no-cache
df -h
```

### Certificat Let's Encrypt expire

```bash
sudo certbot renew
sudo systemctl reload nginx
```

### Erreurs Vercel au build

Consultez les logs de build dans le dashboard Vercel. Les erreurs courantes :
- **Variable d'environnement manquante** : verifiez que toutes les variables de l'etape 10.2 sont presentes.
- **Erreur TypeScript** : corrigez dans le code source et poussez — Vercel redeploit automatiquement.

---

## 14. Checklist securite

Avant de considerer le deploiement comme termine, verifiez chaque point :

- [ ] Le pare-feu (`ufw`) n'autorise que les ports 22, 80 et 443.
- [ ] Le port 3001 n'est **pas** accessible directement depuis Internet (tester avec `curl http://IP_VPS:3001/health` depuis une autre machine — doit echouer).
- [ ] Le port 6379 (Redis) n'est **pas** accessible depuis Internet.
- [ ] `BRIDGE_API_KEY` est identique dans Vercel et dans `smpp-bridge/.env`, genere avec `openssl rand -hex 32`, et jamais commite dans git.
- [ ] Les fichiers `.env` sur le VPS ont des permissions restreintes (`chmod 600`).
- [ ] fail2ban est actif (`sudo systemctl status fail2ban`).
- [ ] HTTPS est actif pour le bridge (`https://bridge.votredomaine.com`).
- [ ] HTTPS est actif pour l'app sur Vercel (`https://sms.votredomaine.com`).
- [ ] Le renouvellement automatique du certificat fonctionne (`sudo certbot renew --dry-run`).
- [ ] Le endpoint `/health` du bridge est bloque depuis Internet (la regle Nginx `deny all` est en place).
- [ ] Docker demarre au boot (`sudo systemctl is-enabled docker`).
- [ ] Le tunnel Cloudflare tourne en tant que service sur la machine locale.
- [ ] Le jeton de service Cloudflare (Access) est le seul moyen d'acceder au tunnel SMSC.
- [ ] Les variables sensibles dans Vercel ne sont pas exposees cote client (pas de prefixe `NEXT_PUBLIC_` sur les secrets).

---

## Si le SMSC devient accessible depuis le VPS

Si votre operateur SMSC autorise l'IP du VPS (ou si le SMSC est accessible publiquement), vous pouvez simplifier l'architecture en supprimant le tunnel :

1. Dans `smpp-bridge/.env`, changez :
   ```bash
   SMPP_HOST=10.76.5.228
   SMPP_PORT=3600
   ```

2. Dans `docker-compose.yml`, supprimez le service `cloudflared` et retirez `cloudflared` de la section `depends_on` de `smpp-bridge`.

3. Supprimez le fichier `.env` racine (il ne contient que les variables du tunnel).

4. Relancez :
   ```bash
   docker compose up -d
   ```

5. Desactivez le tunnel dans le dashboard Cloudflare et arretez le service `cloudflared` sur votre machine locale.
