# 07 — Sécurité

Modèle de menaces et mesures en place. Le projet est **personnel** (1 utilisateur principal, données publiques d'un lac) — donc on a une approche **proportionnée** au risque, pas une forteresse.

---

## Modèle de menaces

Qui pourrait vouloir attaquer cette app, et pourquoi ?

| Acteur | Motivation | Probabilité |
|---|---|---|
| **Bots opportunistes** | Scan automatique d'IPs, exploits CVE, brute-force SSH | **Élevée** (permanente) |
| **Crypto-mineurs** | Compromettre le VPS pour miner | Moyenne |
| **Concurrent / hater de papa** | Vandalisme | Quasi-nulle |
| **État, hacker ciblé** | Espionnage | **Nulle** (aucun intérêt) |

**Donc on protège contre les attaques opportunistes** (90% des menaces réelles).

---

## Couches de défense

### 1. Réseau

**Firewall ufw** : seuls les ports 22 (SSH), 80 (HTTP), 443 (HTTPS) sont ouverts. Tout le reste est `deny incoming`.

```bash
ssh lac "sudo ufw status"
```

Si jamais on installait Redis ou Postgres, ils seraient automatiquement inaccessibles de l'extérieur (port 6379 / 5432 fermé).

### 2. Reverse proxy + TLS

**Caddy** :
- Force HTTPS (redirige HTTP → HTTPS)
- Certificat Let's Encrypt auto-renouvelé
- HTTP/2 + HTTP/3 (QUIC)
- Ne révèle pas Next.js (header `Server: Caddy`)

**Conséquence** : toutes les communications client ↔ serveur sont chiffrées, intermédiaires (FAI, opérateur mobile de papa) ne peuvent pas lire ni modifier le trafic.

### 3. SSH hardening

Voir [05-infrastructure.md](05-infrastructure.md) section "SSH hardening" pour les détails.

**En résumé** :
- ❌ `PasswordAuthentication no` → pas de brute-force possible
- ✅ `PubkeyAuthentication yes` → seul détenteur de la clé privée peut entrer
- 🚫 `PermitRootLogin prohibit-password` → root accessible seulement par clé

**Test rapide que c'est appliqué** :
```bash
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no ubuntu@vps-9bc559d8.vps.ovh.net
# Doit échouer avec : Permission denied (publickey).
```

### 4. fail2ban

Si malgré tout un bot rate 5 tentatives de connexion SSH en 10 minutes, son IP est **bannie 1h** au niveau iptables.

```bash
ssh lac "sudo fail2ban-client status sshd"
```

### 5. Privilèges minimaux

**Tout tourne sous l'utilisateur `app`**, pas root :
- Si une faille remote-code-execution dans Next.js → l'attaquant a les droits `app` (read-only sauf `/var/lib/lac/`)
- Pas d'accès à `/etc`, `/usr`, autres `/home/*`

**systemd hardening** dans les services :
- `ProtectSystem=full` — `/usr` `/boot` `/etc` en read-only pour le process
- `ProtectHome=true|read-only` — `/home` invisible
- `NoNewPrivileges=true` — bloque les binaires setuid
- `ReadWritePaths=/var/lib/lac` — autorise écriture uniquement où c'est nécessaire

### 6. Authentification web (admin)

**Lecture** : aucune auth, accès public. Les données ne sont pas sensibles (niveau d'eau d'un lac public).

**Mutations** (création/modification/suppression de seuils, page `/admin`) :
- Protégées par mot de passe (`ADMIN_PASSWORD` = `gothis1234` actuellement)
- Une fois loggé, **cookie de session iron-session** :
  - **HttpOnly** : pas accessible en JavaScript (immunisé au XSS pour exfiltrer le cookie)
  - **Secure** : envoyé uniquement en HTTPS
  - **SameSite=Strict** : pas envoyé sur les requêtes cross-origin (immunisé au CSRF)
  - **Chiffré** avec `SESSION_PASSWORD` (32 chars hex aléatoires) : un attaquant qui dump le cookie ne peut pas lire son contenu ni le forger
  - **Expiration** : 7 jours d'inactivité

### 7. Validation des entrées

Toutes les routes POST/PUT valident leur body avec **Zod** :

```typescript
const Body = z.object({
  name: z.string().min(1).max(100),
  value: z.number().min(600).max(700),       // safety : range plausible
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  dash_style: z.enum(["solid", "dash", ...]),
});
```

Empêche :
- Injection SQL (les `?` placeholders de `better-sqlite3` + validation type number)
- Stockage de strings énormes (DoS via 1 GB de description)
- Couleurs avec `javascript:...` (regex hex stricte)
- Valeurs absurdes (niveau d'eau à 1 000 000 m)

### 8. Pas d'exposition de données sensibles

- Variables d'env (`.env*`) **jamais commitées** (gitignore)
- Pas de credentials dans le code source
- Pas de logs avec mots de passe (Next.js et systemd loggent les requêtes mais pas les bodies)

---

## Les secrets actuels

| Secret | Où | Comment le tourner |
|---|---|---|
| Clé SSH | `~/.ssh/id_ed25519_perso` | `ssh-keygen` + `ssh-copy-id` + retirer l'ancienne de `authorized_keys` |
| `ADMIN_PASSWORD` | `/opt/lac/web/.env.production` | voir [06-operations.md](06-operations.md) "Changer un secret" |
| `SESSION_PASSWORD` | idem | idem (invalide toutes les sessions actuelles) |
| `OPENAI_API_KEY` | `/opt/lac/worker/.env` | révoque sur platform.openai.com + crée nouvelle + update .env |
| `LAC_API_AUTH` | `/opt/lac/worker/.env` | constante Laetis publique, n'a pas vocation à changer |

---

## Risques résiduels assumés

| Risque | Pourquoi on l'accepte |
|---|---|
| **`ADMIN_PASSWORD` faible (`gothis1234`)** | Faible enjeu (modifier des lignes de seuil), fail2ban limite le brute-force HTTP via l'auth POST. Mais voir "À renforcer si paranoïaque" plus bas. |
| **Pas de rate-limiting applicatif sur `/api/auth/login`** | Idem. À ajouter si besoin (~30 lignes de code avec un Map en mémoire). |
| **Pas de CDN ou WAF** | Trafic = 5-10 req/jour. DDoS volumétrique = catastrophique mais ultra-improbable. |
| **Pas de redondance (1 VPS unique)** | Si OVH plante, on est down. Acceptable, papa peut attendre quelques heures. |
| **Backups locaux uniquement** | Crash disque = perte des 24h max. Pas de backup off-site. À ajouter si critique. |
| **HTTPS sur sous-domaine OVH** | Risque : si OVH compromet leur DNS, MITM possible. Ultra-improbable, et acceptable. |

---

## À renforcer si paranoïaque

### Renforcer `ADMIN_PASSWORD`

```bash
NEW_PASS="LacSaintsPeyres-Mai2026!"
ssh lac "sudo sed -i 's|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$NEW_PASS|' /opt/lac/web/.env.production && sudo systemctl restart lac-web.service"
```

15+ chars, mix maj/min/chiffres/symboles → entropie ~80 bits, ~10^24 essais pour brute-force. Inattaquable.

### Ajouter du rate-limiting sur `/api/auth/login`

Middleware Next.js simple (in-memory Map IP → timestamps) :
```typescript
// web/src/middleware.ts
import { NextResponse } from "next/server";

const attempts = new Map<string, number[]>();

export function middleware(req: Request) {
  if (req.method === "POST" && new URL(req.url).pathname === "/api/auth/login") {
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const now = Date.now();
    const recent = (attempts.get(ip) ?? []).filter(t => now - t < 15 * 60_000);
    if (recent.length >= 5) return new NextResponse("Too many attempts", { status: 429 });
    attempts.set(ip, [...recent, now]);
  }
  return NextResponse.next();
}
```

### Backup off-site

Ajouter une copie quotidienne de la DB vers iCloud (depuis le Mac) ou Backblaze B2 (~0,5€/mois) :
```bash
# Sur le Mac, cron 03:00 (1h après le backup du VPS)
0 3 * * * rsync app@lac:/var/lib/lac/backups/niveau_eau-$(date +\%Y\%m\%d).db ~/iCloud-Backups/lac/
```

### Désactiver complètement le user `ubuntu`

Une fois la prod stable :
1. Créer un user `deploy` perso à la place
2. `sudo deluser ubuntu`

Réduit la surface d'attaque (un seul compte utilisable au lieu de 2).

### Geoblocking avec Caddy

Si tu veux bloquer toutes les IPs hors France :
```
vps-9bc559d8.vps.ovh.net {
    @blocked not maxmind_country FR
    respond @blocked 403
    encode gzip
    reverse_proxy localhost:3000
}
```
Nécessite le plugin Caddy `maxmind`. Overkill ici.

---

## Pour aller plus loin

- Historique des choix et motivations : [09-history.md](09-history.md)
- Procédures opérationnelles : [06-operations.md](06-operations.md)
