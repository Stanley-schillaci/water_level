# Lac des Saints Peyres — V2

Application personnelle de suivi du **niveau d'eau du barrage du lac des Saints Peyres** (Tarn, Occitanie).

> **Pour qui ?** Mon papa, qui a un bateau amarré au lac et qui consulte plusieurs fois par jour depuis son iPhone pour savoir s'il a encore assez d'eau sous la coque, et quand il faudra basculer du ponton fixe au ponton amovible.

---

## 🎯 Concept métier

Le lac des Saints Peyres est un réservoir hydroélectrique fermé par un barrage. Son niveau varie fortement selon la saison : souvent plein en juin / début juillet, vidange progressive à partir de mi-juillet (agriculture, production électrique, sécheresses). Fin août / septembre est la période la plus critique pour la navigation.

Papa est en début de lac, côté peu profond. Il dispose de **deux pontons** :

- **Ponton FIXE** : ancré à un bloc béton, articulé en 2 sections de 6 m. Il suit le niveau de l'eau en hauteur uniquement. Quand le lac descend trop, les bidons flottants reposent au sol et le ponton devient inutilisable. C'est le ponton de référence en haute saison.
- **Ponton AMOVIBLE** : plateforme libre tractée à pied, déplacée progressivement vers le trait d'eau au fil de la baisse du lac. C'est le ponton de "fin de saison" quand le lac est trop bas.

Le **passage du fixe à l'amovible** est une décision de papa, pas de l'app. Papa veut juste savoir : combien d'eau il reste sous la coque, et à quel point le risque de toucher le fond s'approche du tirant d'eau du bateau (80 cm).

L'API publique **`data.niv-eau.fr`** (Laetis, opérateur du barrage) publie le niveau du lac toutes les 20 minutes. L'app récupère ces données, les stocke, et présente :

- Le **niveau actuel** dans le référentiel choisi (mNGF / sous la coque / depuis le minimum historique)
- Des **KPIs** : VS hier, VS 3 jours, VS 1 semaine, tendance 7 jours (avec auto m↔cm)
- Une **phrase IA** générée plusieurs fois par jour (cadence réglable) qui décrit factuellement la situation et le niveau de risque par rapport au tirant d'eau
- Des **graphiques** sur 1, 3, 7, 14, 30, 60, 90, 180 ou 365 jours, colorés selon la pente
- Une **comparaison annuelle** (VS 2024 / 2023 / 2022)
- L'**historique complet** depuis le 7 juillet 2021 (début de l'API)
- Un **panel admin** pour : étalonner le ponton avec le sondeur, régler le tirant d'eau, gérer des seuils visuels, éditer le system prompt de l'IA, monitorer toutes les générations IA (prompts envoyés + réponses)

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
| **ai-refresher.py** (Python) | Génère la phrase IA (GPT-4o, prompt system+user) selon la cadence configurée | Cron toutes les heures (xx:55), la policy décide |
| **Next.js** (TypeScript) | Sert l'app web (4 pages : 💧 / 📈 / ⚙️ / admin) | Daemon always-on |

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
**https://gothis.duckdns.org/** (l'ancien `https://vps-9bc559d8.vps.ovh.net/` reste actif en filet de sécurité)

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
