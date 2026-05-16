# 09 — Historique et décisions

Pourquoi on a fait les choix qu'on a faits, et ce qu'on a explicitement abandonné. À lire quand tu reprends le projet dans 6 mois et que tu te demandes "mais pourquoi on a fait ça comme ça ?".

---

## Chronologie

### 2021-07-07 — Naissance du projet

Premier appel de l'API Laetis. La V1 (Streamlit) commence à scraper. Stockage SQLite (`niveau_eau.db`).

### 2024 → 2025 — Vie de la V1

Plusieurs petits fixes : retrait de l'année entière dans certains graphs, ajout de l'IA OpenAI pour le commentaire, dependencies, etc. Voir commits sur `main` antérieurs au tag `v1.0.0`.

### 2026-05-15 — Tag v1.0.0 + démarrage V2

Pose du tag `v1.0.0` sur le dernier commit Streamlit Cloud "fonctionnel" (rollback point garanti). Création de la branche `v2` clean slate.

Une seule session de travail (~6h) :
- Brainstorming complet (architecture, stack, hébergement, UX mobile)
- Rédaction du spec
- Rédaction de 2 plans d'implémentation (Plan 1 = worker, Plan 2 = front, Plan 3 = infra)
- Implémentation des 3 plans
- Déploiement sur OVH VPS-1 (Roubaix)
- Documentation FR

### Mai 2026+ — V2 en prod

URL principale : `https://gothis.duckdns.org/` (DuckDNS, gratuit, mémorisable). `https://vps-9bc559d8.vps.ovh.net/` reste actif en filet de sécurité. Streamlit Cloud reste up en backup. Cutover définitif prévu à J+30 si tout est stable.

### 2026-05-16 (soir) — V2.2 : référentiels d'affichage relatifs

La donnée brute publiée par Laetis est en mNGF (altitude par rapport au niveau de la mer), donc 666,97 m ne dit pas grand chose à un humain : la région du Tarn est elle-même à ~600 m d'altitude, le lac n'est pas profond de 666 m. Pour rendre la donnée actionnable au quotidien, ajout de **3 référentiels d'affichage interchangeables** :

- **Altitude (mNGF)** — la valeur brute, défaut conservé.
- **Sous le ponton** — profondeur d'eau sous la coque du bateau, calibrée 1× par l'admin (on note `niveau_lac` et `profondeur_sondeur` sur place, l'app stocke `calibration_mngf = niveau − profondeur`). Peut être négatif si le lac descend sous le ponton — c'est précisément le signal qu'il faut déplacer le bateau.
- **Depuis le minimum historique** — hauteur au-dessus du record bas calculé sur l'historique complet (633,66 m le 1er nov. 2022).

**Implémentation** :
- Nouvelle table SQLite `display_settings` (singleton, juste la calibration ponton, auto-bootstrap idempotent côté Next.js).
- Le minimum historique est calculé à la volée par `SELECT MIN(value)`, pas stocké.
- 3 routes API : `GET /api/display/settings` (public), `GET/POST /api/admin/display/calibration` (admin).
- 1 lib `web/src/lib/levelDisplay.ts` qui centralise conversions + formatage (auto m↔cm pour les petits deltas).
- 1 React Provider `DisplayProvider` au layout qui lit le mode stocké + les refs, exposés via `useDisplay()`.
- Sections UI : « Affichage du niveau » dans `/options` (radios), « 📐 Étalonnage du ponton » dans `/admin` (niveau actuel en lecture seule + champ profondeur sondeur).
- Composants mis à jour : `LevelHero`, `KpiGrid`, `WaterChart`, `ColoredCurveChart`. Les seuils, le tooltip et l'axe Y sont tous convertis dans le référentiel courant. Précision forcée à `.toFixed(2)` pour éviter les artefacts flottants des conversions.

**Tradeoffs assumés** :
- Le switch est global, pas par-graph (un seul mode pour toute l'app). Simple et cohérent.
- La phrase IA reste en mNGF (le prompt n'est pas mis à jour, ce sera fait dans un futur refactor IA).
- Le mode « Sous le ponton » est désactivé tant que la calibration n'est pas posée par l'admin.

### 2026-05-16 — V2.1 : cadence IA configurable

Itération sur la feature IA :
- Ajout d'une **table `ai_policy`** (singleton) qui pilote la fréquence de génération.
- Le worker `lac-ai-refresher` passe d'un cron quotidien (`07:00`) à un cron horaire (`xx:55`) qui consulte la policy pour décider à chaque tick.
- Nouveau module `worker/policy.py` avec `should_generate_now()` + tests DST été/hiver.
- Nouvelle section « 🤖 Phrases IA » dans le panel admin (toggle, mois/heures, bouton « Régénérer maintenant »).
- Badge ⚠️ rouge sur l'onglet ⚙️ du bottom nav si la dernière génération a échoué (poll `/api/ai/status` toutes les 5 min).
- Fuseau Paris explicite partout (zoneinfo) pour ne pas se faire avoir par le mix SQLite UTC ↔ heure locale.

**Pourquoi maintenant ?** L'utilité de l'IA n'est pas la même selon la saison :
- Mai → août (saison nautique) : papa veut des recommandations fraîches plusieurs fois par jour
- Reste de l'année : 1×/jour suffit largement, voire on peut désactiver complètement

Avant V2.1, changer ça impliquait un redéploiement. Maintenant : 3 clics depuis l'iPhone.

---

## Pourquoi V2 ? Les limites de V1 Streamlit

| Limite V1 | Impact | Solution V2 |
|---|---|---|
| Hébergement Streamlit Cloud gratuit, **pas always-on** | Cold start 1-5 min à chaque consultation, papa râle | VPS OVH always-on, réponse instantanée |
| **UX mobile Streamlit médiocre** | Plotly sur iPhone : tap zoome la page au lieu de scroller, gestures lents | Next.js + Apache ECharts (gestures touch natifs) |
| **Scraping déclenché au démarrage de l'app** | Si personne ne consulte, aucune mesure ingérée → trous dans la DB | Cron systemd toutes les 20 min, indépendant du web |
| **`ignore_dates.yaml` édité à la main** | Maintenance manuelle des jours blancs API, oubli régulier | Table `empty_days` auto-détectée (≥7j passé + API renvoie []) |
| **Pas de PWA installable** | Papa devait ouvrir Safari, taper l'URL ou un bookmark | PWA "Sur l'écran d'accueil", icône, plein écran |
| **Prophet forecast jusqu'à fin d'année** | Inutile, papa l'a jamais regardé | Supprimé du scope V2 |
| **Pas de monitoring** | Si scraping plante, on s'en rend compte 1 semaine plus tard | UptimeRobot + `/api/health` (alerte si stale > 2h) |

---

## Décisions techniques et leur "pourquoi"

### Décision : OVH VPS plutôt que Hetzner / Render / Cloud Run

**Choix : OVH VPS-1** (4 vCores / 8 GB RAM, ~6,62€ TTC/mois, Roubaix)

**Pourquoi pas Hetzner ?**
- ~2€/mois moins cher (CX23 à ~4,79€ TTC)
- Mais Hetzner est allemand → on perd le "cocorico"
- Et après la hausse Hetzner d'avril 2026, l'écart de prix s'est réduit

**Pourquoi pas Render / Fly.io / Railway ?**
- Free tier endort le VPS → cold start (le problème V1)
- Payant ≥ 5$/mois → plus cher qu'OVH avec moins de specs
- Ça ajoute du Docker / containers à gérer pour rien

**Pourquoi pas Cloud Run / Lambda ?**
- Serverless = cold start (le problème V1)
- Trop complexe pour un projet perso

**Pourquoi pas un VPS Scaleway / DigitalOcean ?**
- Specs équivalentes plus chères qu'OVH

**Verdict V2** : OVH = bon rapport prix/perf, support FR, RGPD, simplicité.

### Décision : Next.js 15 plutôt que Streamlit / Astro / FastAPI+HTMX

**Choix : Next.js 15 + Apache ECharts**

**Critères** :
- UX mobile native (gestures touch)
- PWA installable
- SSR pour rendu instantané sur 3G
- Stack mainstream (recrute facile, doc abondante)

**Alternatives évaluées** :
- **Streamlit (garder)** : reste lourd, mauvais sur mobile, gestures Plotly pas top
- **Astro + Svelte** : très léger, mais moins commun, courbe d'apprentissage
- **FastAPI + HTMX** : garde Python mais UX mobile entre Streamlit et SPA, pas idéal
- **App native iOS** : 99€/an Apple Dev + builds + TestFlight, overkill

**Verdict** : Next.js 15 gagne sur l'UX mobile (le gain principal de V2).

### Décision : SQLite (gardée) plutôt que PostgreSQL

**Choix : garder SQLite**

**Pourquoi pas PostgreSQL local ?**
- Pas de tuning à faire pour 1 utilisateur, SQLite est largement plus rapide
- Pas de service à maintenir (no `pg_ctl`, no réplication)
- Fichier unique = backups triviaux
- Garde l'historique V1 sans transformation

**Pourquoi pas PostgreSQL managé (Supabase / Neon free) ?**
- Free tier dort → cold start (le problème V1)
- Latence réseau (lecture/écriture)
- Vendor lock-in

**Verdict** : SQLite + mode WAL est parfait pour 1 utilisateur.

### Décision : Cron Python séparé plutôt que tout-Node

**Choix : worker Python (port quasi 1:1 de V1) + Next.js**

**Pourquoi pas tout en Node ?**
- Rééécrire scraper + AI + migrate en TypeScript = ~2 jours
- Le code Python V1 était déjà rodé depuis 1 an (testé en prod)
- Garder les responsabilités séparées (worker = DB writes, web = DB reads)

**Pourquoi pas tout en Python (Streamlit-like) ?**
- C'est exactement ce qu'on quitte (V1)

**Verdict** : approche hybride avec 2 procès isolés sur 1 VPS, partageant 1 SQLite. Best of both worlds.

### Décision : GPT-4o pré-calculé 1×/jour plutôt qu'à chaque visite

**Choix : phrase IA générée à 07:00, stockée en DB, servie statiquement**

**Pourquoi pas à chaque page load ?**
- Latence OpenAI (~1-2s) = page Now lente
- Coût (5-10 visites/jour × 365 j = 0,15€/mois vs 0,10€/mois en pré-calcul)
- Variabilité : papa rafraîchirait → phrase change → confus

**Pourquoi pas 4× par jour ?**
- Pas de valeur ajoutée : le niveau d'eau n'évolue pas si vite
- Coût ×4

**Verdict** : 1×/jour au matin = phrase fraîche au saut du lit, coût minimal.

### Décision : Caddy plutôt que nginx

**Choix : Caddy**

**Pourquoi pas nginx ?**
- nginx demande Certbot pour Let's Encrypt + cron pour renouveler
- Configuration plus verbeuse
- Pas de HTTP/3 par défaut

**Caddy en 3 lignes** :
```
vps-9bc559d8.vps.ovh.net {
    encode gzip
    reverse_proxy localhost:3000
}
```
TLS auto, renew auto, HTTP/2, HTTP/3. Fini.

### Décision : Pas de service worker / pas d'offline

**Choix : PWA simple (manifest + apple-touch-icon)**

**Pourquoi pas un vrai PWA avec offline ?**
- Le but est de voir le niveau **frais** du lac → si offline, les données sont obsolètes → pas utile
- Un service worker ajoute de la complexité (versioning, cache invalidation, mises à jour silencieuses)
- iOS Safari supporte les notifications push depuis iOS 16.4, mais pas demandé par papa

### Décision : Sous-domaine OVH plutôt que domaine perso

**Choix : `vps-9bc559d8.vps.ovh.net`** (gratuit, attribué par OVH)

**Pourquoi pas un domaine perso ?**
- ~10€/an pour `niveau-saints-peyres.fr`
- Pas critique : papa a un bookmark / icône d'accueil, ne tape jamais l'URL
- À tout moment achetable plus tard sans changer le code (juste 3 lignes Caddyfile)

### Décision : Pas de Docker

**Choix : déploiement direct via systemd**

**Pourquoi pas Docker / Docker Compose ?**
- 1 VPS, 1 app, 1 user → Docker = overhead inutile
- Build d'une image Docker = ~50 MB à push à chaque deploy vs ~1 MB de rsync
- Docker daemon = mémoire en moins pour l'app
- systemd est natif Linux, hot-reload via `systemctl restart` instantané

**Quand Docker aurait du sens** : si on déploie 10+ apps sur le même VPS, ou si on doit migrer entre clouds, ou si on a une équipe.

---

## Ce qu'on a explicitement abandonné

| Feature V1 | Pourquoi pas en V2 |
|---|---|
| **Prévision Prophet jusqu'à fin d'année** | Papa l'a jamais regardée. Calcul ML coûteux (CPU) pour zéro valeur. |
| **Throttling fin sur OpenAI** (V1 avait `should_generate_commentary` avec 6h cooldown) | Plus pertinent : cron tourne 1×/jour, pas de risque de spam. |
| **Affichage de la prévision sur la home** | Idem. |

## Ce qu'on n'a PAS implémenté (volontairement)

| Feature évaluée | Décision | Raison |
|---|---|---|
| **Comptes utilisateurs (multi-user)** | Non | 1 utilisateur principal (papa) suffit |
| **Notifications push iOS** | Non | iOS supporte depuis 16.4, mais papa consulte volontairement |
| **Export CSV public** | Non | Si besoin, admin peut SCP la DB |
| **App native iOS** | Non | PWA suffit |
| **Backup off-site (B2/S3)** | Non | Backups locaux 7j + sauvegarde OVH 1j incluse suffisent |
| **Rate limiting sur /api/auth/login** | Non | gothis1234 + fail2ban + faible enjeu suffisent |
| **CI/CD GitHub Actions** | Non | `make deploy` depuis le Mac suffit, pas d'équipe |
| **Monitoring APM (Datadog / Sentry)** | Non | journalctl + UptimeRobot suffisent |
| **Réplication DB / HA** | Non | Crash hardware = perte 24h max, acceptable |
| **CDN / WAF** | Non | 5-10 req/jour, latence FR < 30 ms |

---

## Tags Git

- **`v1.0.0`** (87a910a) — Version Streamlit Cloud fonctionnelle. Rollback point garanti.
  - DB SQLite 14 MB jusqu'à fév 2025
  - Code Streamlit + Prophet + GPT-4o + ignore_dates.yaml
- **`v2.0.0`** — À poser quand V2 sera stable en prod depuis J+30
  - Commande prévue : `git tag -a v2.0.0 -m "V2 production stable on OVH VPS-1"`

---

## Coûts comparés V1 vs V2

| Item | V1 (mai 2026) | V2 (mai 2026) |
|---|---|---|
| Hébergement | **0€/mois** (Streamlit Cloud free) | **~6,62€/mois TTC** (OVH VPS-1) |
| LLM | ~0,30€/mois (GPT-4o à chaque visite throttlée 6h) | ~0,10€/mois (GPT-4o 1×/jour) |
| Domaine | 0€ (gothis.streamlit.app) | 0€ (vps-XXX.vps.ovh.net) |
| Backups | 0€ (Streamlit DB Cloud) | 0€ (local) |
| Monitoring | 0€ (rien) | 0€ (UptimeRobot free) |
| **Total** | **~0,30€/mois** | **~6,72€/mois TTC** |
| **Coût annuel** | **~3,60€/an** | **~80,64€/an** |

**Surcoût V2 : ~77€/an** pour un service always-on + UX mobile native + scraping autonome + monitoring.

---

## Modifications du repo au cours du temps

Branche `v2` :

```
v1.0.0           V1 Streamlit fonctionnelle (rollback)
   │
   │ (branche v2 créée, clean slate)
   ▼
chore: clean slate for V2 development
   │
   │ (rédaction spec + 2 plans)
   ▼
docs: design spec V2
docs: implementation plan 1 (Python worker)
docs: implementation plan 2 (Next.js front)
   │
   │ (implémentation Plan 1)
   ▼
[14 commits du worker Python]
   │
   │ (implémentation Plan 2)
   ▼
[9 commits du Next.js front]
   │
   │ (implémentation Plan 3 + déploiement)
   ▼
feat(infra): Plan 3 — OVH bootstrap + Caddy + systemd
fix(infra+web): deployment fixes from first production rollout
chore(infra): bootstrap.sh reproducibility
   │
   │ (cleanup repo + doc FR)
   ▼
chore: clean repo + doc française complète
```

---

## Pour aller plus loin

- Architecture globale : [01-architecture.md](01-architecture.md)
- Procédures opérationnelles : [06-operations.md](06-operations.md)
