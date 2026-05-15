# Lac des Saints Peyres — V2

Application personnelle de suivi du **niveau d'eau du barrage du lac des Saints Peyres** (Tarn, Occitanie).

> **Pour qui ?** Mon papa, qui a un bateau amarré sur ponton flottant et qui consulte le niveau du lac plusieurs fois par jour depuis son iPhone pour décider s'il faut déplacer le bateau.

---

## 🎯 Concept métier

Le lac des Saints Peyres est un lac de retenue fermé par un barrage. Son niveau varie au gré des saisons, des précipitations et des lâchers d'eau du barrage. Les ponton flottants suivent le niveau, mais un bateau amarré peut se retrouver :

- **Trop haut** quand le niveau monte → la coque tape sur la berge ou le ponton fait pression
- **Trop bas** quand le niveau baisse → la coque touche le fond ou s'échoue
- **Coupé du ponton** si le ponton se désaccouple

L'API publique **`data.niv-eau.fr`** (Laetis, opérateur du barrage) publie le niveau toutes les 20 minutes. L'app récupère ces données, les stocke, et présente :

- Le **niveau actuel** + tendance récente
- Une **phrase IA** quotidienne qui recommande "ne rien faire / reculer un peu / déplacer ailleurs" en se basant sur le niveau et les seuils définis
- Des **graphiques** sur 3, 7, 30, 90 ou 365 jours
- Une **comparaison annuelle** (superposition des années)
- L'**historique complet** depuis le 7 juillet 2021 (début de l'API)
- La **gestion de lignes de seuil** (admin) pour matérialiser sur les graphs les valeurs critiques (ex: "bateau touche le fond à 663m")

---

## 🏗️ Architecture en 30 secondes

```
┌────── OVH VPS-1 (Roubaix, Ubuntu 24.04 LTS) ──────┐
│                                                    │
│   ┌──────────────┐    ┌─────────────────────┐     │
│   │ scraper.py   │───▶│  niveau_eau.db      │     │
│   │ cron 20mn    │    │  (SQLite WAL)       │     │
│   └──────────────┘    │   • water_level     │     │
│                       │   • threshold_line  │     │
│   ┌──────────────┐    │   • gpt_logs        │     │
│   │ ai-refresher │───▶│   • empty_days      │     │
│   │ cron 07h00   │    └─────────────────────┘     │
│   └──────────────┘                 ▲              │
│                                    │              │
│   ┌──────────────────┐   ┌─────────┴─────────┐    │
│   │ Caddy + TLS auto │───▶  Next.js 15 PWA   │    │
│   └──────────────────┘   └───────────────────┘    │
└────────────────────────────────────────────────────┘
                      │
                      ▼ (HTTPS)
              iPhone de papa (PWA installée)
```

**3 processus** sur **1 VPS** partageant **1 fichier SQLite** :

| Composant | Rôle | Quand |
|---|---|---|
| **scraper.py** (Python) | Récupère les mesures Laetis, écrit dans la DB | Cron toutes les 20 min |
| **ai-refresher.py** (Python) | Génère la phrase IA via GPT-4o, écrit dans la DB | Cron 1× par jour à 07:00 |
| **Next.js** (TypeScript) | Sert l'app web (3 vues + admin) | Daemon always-on |

L'**isolation des processus** permet : (1) que le scraping ne dépende pas de la consultation web, (2) que la phrase IA soit pré-calculée et donc instantanée à servir, (3) que Next.js n'ait qu'à **lire** la DB.

---

## 📚 Documentation détaillée

| Fichier | Sujet |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | Architecture détaillée : diagramme, flux de données, choix techniques |
| [docs/02-database.md](docs/02-database.md) | Schéma SQLite, tables, mode WAL, sauvegardes, migration V1→V2 |
| [docs/03-worker-python.md](docs/03-worker-python.md) | Worker Python : scraper, AI refresher, KPI, table `empty_days` |
| [docs/04-frontend.md](docs/04-frontend.md) | Next.js : vues, composants, routes API, PWA, ECharts |
| [docs/05-infrastructure.md](docs/05-infrastructure.md) | VPS OVH, Caddy (TLS auto), systemd timers, fail2ban, ufw |
| [docs/06-operations.md](docs/06-operations.md) | Déploiement, monitoring, debug, rollback, runbook complet |
| [docs/07-security.md](docs/07-security.md) | Modèle de sécurité, secrets, hardening SSH, hardening web |
| [docs/08-glossary.md](docs/08-glossary.md) | Glossaire (mNGF, PWA, WAL, idempotence, etc.) |
| [docs/09-history.md](docs/09-history.md) | Historique des versions, motivations V2, ce qu'on a abandonné |

---

## 🚀 Quick reference

### URL de prod
**https://vps-9bc559d8.vps.ovh.net/**

### Coûts mensuels
~4,30€ TTC (OVH VPS-1 + OpenAI ~0,10€)

### Repo
**[github.com/Stanley-schillaci/water_level](https://github.com/Stanley-schillaci/water_level)** — branche `v2` (devient `main` après stabilisation)

### Tags
- **v1.0.0** : version Streamlit Cloud (référence rollback)
- **v2.0.0** : version VPS + Next.js (à poser après J+30 de prod stable)

### Commandes locales utiles (Makefile)

```bash
make dev VPS=lac              # Lance Next.js en dev sur :3000
make deploy VPS=lac           # Build + rsync + restart
make status VPS=lac           # Statut des services systemd
make logs VPS=lac             # Logs Next.js en live
make logs-scraper VPS=lac     # Logs scraper
make logs-ai VPS=lac          # Logs AI refresher
```

Le `VPS=lac` réfère à l'alias SSH dans `~/.ssh/config` (à configurer une fois).

---

## 🔑 Décisions clés (résumé)

| Décision | Pourquoi |
|---|---|
| **OVH VPS-1** plutôt que Streamlit Cloud | Always-on (pas de cold start 1-5min), maîtrise complète, ~4€/mois |
| **Next.js 15 + ECharts** plutôt que Streamlit | UX mobile native (gestures touch fluides sur iPhone) |
| **SQLite (gardée)** plutôt que PostgreSQL | 1 utilisateur, simplicité, fichier unique, déjà 1 an de données |
| **Cron Python séparé** plutôt que tout-Node | Réutilise le code V1 rodé depuis 1 an, isolation propre |
| **GPT-4o 1×/jour** plutôt que à chaque visite | Pré-calculé en DB, zéro latence côté front, ~0,10€/mois |
| **Caddy** plutôt que nginx | TLS Let's Encrypt automatique en 3 lignes de config |
| **Pas de domaine perso** | Sous-domaine OVH suffit, économie 10€/an |
| **`empty_days` (nouveau)** remplace `ignore_dates.yaml` | Auto-détection des jours sans donnée API → plus de maintenance manuelle |

---

## 📜 Licence

MIT — voir [LICENSE](LICENSE).
