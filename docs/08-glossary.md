# 08 — Glossaire

Termes techniques et métier utilisés dans le projet, expliqués pour ne plus avoir à googler dans 1 an.

---

## Métier

**Lac des Saints Peyres**
Lac de retenue artificiel situé dans le Tarn (Occitanie), créé par le barrage des Saints-Peyres en 1932. Réservoir hydroélectrique de ~110 hectares.

**mNGF — mètres NGF (Nivellement Général de la France)**
Unité officielle d'altitude en France. 0 mNGF = niveau moyen de la mer à Marseille (mesuré par le marégraphe de Marseille, en service depuis 1897). Le niveau du lac est exprimé en mètres mNGF (typiquement entre 633 m — record bas de 2022 — et 670 m en eaux hautes). C'est l'unité dans laquelle Laetis publie la donnée brute, donc l'unité stockée en DB.

**Référentiel d'affichage**
L'app supporte 3 manières d'afficher le niveau (réglage perso dans `/options`) :
1. **Altitude (mNGF)** — la valeur brute (ex : 666.97 m).
2. **Sous le ponton** — profondeur d'eau sous la coque du bateau, calculée à partir d'une calibration (ex : 2,30 m sous la coque). Disponible uniquement si l'admin a étalonné le ponton.
3. **Depuis le minimum historique** — hauteur au-dessus du record bas (ex : +33,3 m depuis le min). Le minimum est `MIN(value) FROM water_level` recalculé à chaque requête.

La donnée stockée reste toujours en mNGF, on convertit à l'affichage seulement (cf `lib/levelDisplay.ts`).

**Étalonnage ponton**
Procédure faite 1× par l'admin pour activer le mode « Sous le ponton ». Sur le bateau, l'admin note la profondeur indiquée par le sondeur quand le bateau est sur son ponton. L'app calcule `ponton_calibration_mngf = niveau_actuel − profondeur_sondeur` et le stocke dans `display_settings.ponton_calibration_mngf`. Tant que le ponton n'est pas déplacé ni le bateau changé, cette valeur reste valide.

**Laetis**
Opérateur du barrage du lac des Saints Peyres, qui expose l'API publique `data.niv-eau.fr` pour les niveaux d'eau.

**Tirant d'eau**
Profondeur de la partie immergée d'un bateau. Le bateau de papa a un tirant d'eau de **0,80 m** (V2.3+) → il faut au moins 80 cm d'eau sous la coque pour amarrer sans risque. Au-dessous, la coque tape le fond. La valeur est paramétrable depuis `/admin > ⚓ Bateau`.

**Ponton flottant**
Plateforme flottante reliée à la berge par une passerelle articulée. Suit le niveau de l'eau mais peut se désaccoupler de la berge si le niveau descend trop bas (ou inversement, monter trop haut).

**Seuil**
Valeur critique du niveau d'eau (en mNGF) qui déclenche une action. Exemples :
- "Bateau touche le fond" — niveau en dessous duquel la coque s'échoue
- "Ponton max" — niveau au-dessus duquel le ponton est en tension excessive
- "Niveau optimal" — niveau idéal pour la navigation

Les seuils sont stockés dans la table `threshold_line` et affichés en lignes horizontales sur les graphs.

---

## Technique général

**PWA — Progressive Web App**
Site web installable sur l'écran d'accueil d'un téléphone (iPhone via Safari → Partager → "Sur l'écran d'accueil"). Ressenti "app native" : icône, plein écran, sans la barre Safari. Aucune validation Apple Store nécessaire, gratuit.

**SSR — Server-Side Rendering**
Le HTML est généré côté serveur à chaque requête (par opposition au SPA pur où le client génère tout en JS). Avantages : rendu instantané (pas d'attente de chargement JS), SEO, accessibilité.

**SSG — Static Site Generation**
Le HTML est pré-généré au moment du build et servi statiquement. Très rapide, mais incompatible avec des données dynamiques. Next.js essaie de SSG-er par défaut → on désactive avec `export const dynamic = "force-dynamic"` sur les pages qui lisent la DB.

**App Router (Next.js)**
Nouvelle façon de structurer les routes dans Next.js (depuis v13). Basée sur des dossiers dans `app/`. Chaque dossier = une route, `page.tsx` = la page, `route.ts` = une API route.

**Server Component vs Client Component (React 19 / Next.js 15)**
- **Server Component** (par défaut) : rendu côté serveur, peut faire des `await getDb()` directement. Pas d'`useState`, pas d'événements.
- **Client Component** (`"use client";` en tête) : rendu côté client, peut utiliser hooks (`useState`, `useEffect`), événements (`onClick`).

**TLS — Transport Layer Security**
Protocole de chiffrement du trafic HTTP → HTTPS. Successeur de SSL. Caddy gère ça automatiquement via Let's Encrypt.

**Let's Encrypt**
Autorité de certification (CA) gratuite. Émet des certificats TLS valides 90 jours, renouvelables automatiquement.

**Reverse proxy**
Serveur HTTP devant ton appli, qui forward le trafic. Caddy ici. Avantages : TLS centralisé, multi-domaines facile, compression, logs unifiés.

**Cron timer (systemd)**
Équivalent moderne de `cron` Unix. Lance une commande à intervalle régulier. `lac-scraper.timer` toutes les 20 min, `lac-ai.timer` chaque jour à 07:00.

**Idempotent**
Une opération qu'on peut exécuter N fois sans changer le résultat par rapport à 1 fois. Ex : `bootstrap.sh` (peut être relancé), `add_measure` (doublon = no-op), `upsert_empty_day` (incrémente le compteur).

**TDD — Test-Driven Development**
Méthodologie : écrire un test qui échoue → écrire le minimum de code pour le faire passer → refactor. Suivie pour le worker Python.

**RGPD**
Règlement européen sur la protection des données personnelles. Pas vraiment applicable ici (pas de données personnelles stockées), mais on a quand même choisi un VPS EU pour la cohérence.

---

## SQLite spécifique

**WAL — Write-Ahead Logging**
Mode de journalisation SQLite qui permet aux lectures de continuer pendant une écriture (vs le mode `delete` par défaut qui pose un verrou exclusif). Activé via `PRAGMA journal_mode = WAL;`. Crée 2 fichiers annexes : `niveau_eau.db-wal` et `niveau_eau.db-shm`.

**Soft delete**
Au lieu de supprimer une ligne, on met un flag `is_deleted = 1`. Permet de récupérer si erreur, et garde l'historique. Utilisé pour `threshold_line`.

**PRAGMA**
Commandes spéciales SQLite (pas du SQL standard) pour configurer ou inspecter la DB. Ex : `PRAGMA journal_mode`, `PRAGMA page_count`.

**better-sqlite3**
Driver SQLite pour Node.js. **Synchrone** (contrairement à `sqlite3` qui est async). Plus rapide, code plus simple. Idéal pour SQLite local.

---

## Python spécifique

**uv**
Gestionnaire de dépendances Python moderne (créé par Astral, les auteurs de `ruff`). Combine `pip` + `venv` + `pip-tools` en un seul binaire, ~10× plus rapide. Lockfile reproductible (`uv.lock`).

**pyproject.toml**
Fichier de configuration standard d'un projet Python (PEP 621). Remplace `setup.py` + `requirements.txt`. Contient : metadata, deps, scripts, config des outils (pytest, ruff).

**console_scripts**
Entry points déclarés dans `pyproject.toml` qui créent des commandes shell. Ex : `lac-scraper = "lac_worker.cli:scraper_main"` crée la commande `lac-scraper` qui appelle la fonction `scraper_main` du module `lac_worker.cli`.

**pytest fixture**
Fonction injectée comme paramètre dans un test. Permet de partager du setup (ex: `tmp_db` crée une DB temporaire) entre plusieurs tests.

---

## OpenAI / LLM

**GPT-4o**
Modèle d'OpenAI utilisé pour générer les phrases IA. Bon compromis qualité/coût (~$2.5/M tokens input, $10/M output en mai 2026).

**Tokens**
Unité de facturation OpenAI. 1 token ≈ 0,75 mots en français. Une phrase de 200 caractères ≈ 50 tokens.

**Prompt**
Texte envoyé au modèle pour obtenir une réponse. Le projet construit 2 prompts (commentary + annual), avec contexte métier, données et instructions strictes ("UNE PHRASE en français").

**Température**
Paramètre OpenAI entre 0 et 2. Bas (0.0-0.5) = réponses plus déterministes/répétables. Haut (0.7-1.5) = plus créatives/variables. On utilise 0.7 pour la tendance (un peu de variation, plus humain) et 0.5 pour la comparaison annuelle (plus factuel).

---

## Sécurité

**HttpOnly cookie**
Cookie inaccessible en JavaScript (via `document.cookie`). Protège contre l'exfiltration par XSS. Utilisé pour la session admin iron-session.

**SameSite=Strict**
Attribut cookie : le cookie n'est **pas envoyé** lors d'une requête initiée depuis un autre site (ex: un lien depuis `evilsite.com` vers `https://vps.../admin`). Protège contre les attaques CSRF.

**CSRF — Cross-Site Request Forgery**
Attaque où un site malveillant fait faire à l'utilisateur authentifié une action sur le site cible (ex: ajouter un seuil) sans son consentement. Mitigé ici par `SameSite=Strict`.

**XSS — Cross-Site Scripting**
Attaque où du JS malveillant est injecté dans l'app et s'exécute dans le navigateur de la victime. React/Next.js échappent automatiquement les contenus dynamiques, et tous les inputs admin sont validés par Zod (pas de stockage de scripts).

**fail2ban**
Daemon Linux qui surveille les logs (notamment SSH) et bannit les IPs qui rate plusieurs connexions. Configuration : 5 essais ratés en 10 min → ban 1h.

**ufw — Uncomplicated Firewall**
Frontend simple pour iptables. Configuration : `ufw allow 22/80/443`, le reste deny.

---

## Réseau

**FQDN — Fully Qualified Domain Name**
Nom de domaine complet avec sous-domaine + domaine + TLD. Ex : `vps-9bc559d8.vps.ovh.net`.

**reverse DNS**
Mapping IP → nom de domaine (contraire du DNS classique). OVH attribue un reverse DNS gratuit à chaque VPS (`vps-XXXX.vps.ovh.net`) — c'est ce qu'on utilise au lieu d'un domaine perso payant.

**TTL — Time To Live**
Durée pendant laquelle un enregistrement DNS est mis en cache. Pas pertinent ici car on n'a pas de domaine propre.

---

## Pour aller plus loin

- Architecture globale : [01-architecture.md](01-architecture.md)
- Historique des choix : [09-history.md](09-history.md)
