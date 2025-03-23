# Surveillance du Niveau d'Eau

## Description du projet

Ce projet permet de surveiller et d’analyser le niveau d’eau d’un barrage du lac des Saints Peyres. Il comprend :

- Une base de données SQLite (niveau_eau.db) dans laquelle les mesures sont stockées.
- Un script (update_missing_day.py) qui insère automatiquement les données manquantes dans la base, récupérées via une API.
- Une application Streamlit (app.py) permettant d’afficher diverses analyses et visualisations (avec Plotly) sur les niveaux d’eau enregistrés.

## Structure des fichiers

```
project/
├── app.py                      # Application Streamlit
├── update_missing_day.py       # Script pour mettre à jour la base de données (insertion des jours manquants)
├── ignore_dates.yaml           # Liste de dates à ignorer lors de la mise à jour
├── bdd.py                      # Fonctions pour la gestion de la base de données SQLite
├── webapp/
│   ├── data_access.py          # Fonctions de récupération des données pour l’application
│   ├── plotly_chart.py         # Fonctions utilitaires pour créer des graphiques Plotly
│   ├── kpi.py                  # Calcul d’indicateurs (KPI) liés au niveau d’eau
│   ├── ui_components.py        # Fonctions et styles pour afficher les KPI dans l’application
│   └── colors.py               # Gestion d’une palette de couleurs fixe selon l’année
└── niveau_eau.db               # Base de données SQLite (créée automatiquement si elle n’existe pas)
```

## Installation

1. Cloner le dépôt ou récupérer les fichiers du projet :
   git clone https://github.com/Stanley-schillaci/water_level.git
   cd water_level

2. Créer un environnement virtuel (optionnel mais recommandé) :
   python -m venv venv
   source venv/bin/activate  # (ou venv\Scripts\activate sous Windows)

3. Installer les dépendances :
   pip install -r requirements.txt

4. Exécuter l’application :
   streamlit run app.py

   L’application Streamlit s’ouvrira dans votre navigateur local (généralement à l’adresse http://localhost:8501).

## Utilisation

- Mise à jour de la base de données :
  Le script update_missing_day.py est appelé automatiquement au lancement de app.py. Il :
    - Identifie les jours manquants depuis une date de départ (par défaut 2021-07-07).
    - Ignore certaines dates définies dans le fichier ignore_dates.yaml.
    - Tente de télécharger les mesures manquantes via l’API et les insère dans la base de données niveau_eau.db.

- Application web :
  L’application (app.py) repose sur Streamlit. Elle :
    - Charge et prépare les données de la base.
    - Calcule des indicateurs (KPI) pour le niveau d’eau.
    - Affiche différents graphiques interactifs via Plotly pour visualiser :
        - L’évolution quotidienne du niveau d’eau depuis une date de début.
        - La comparaison annuelle du niveau d’eau.
        - L’évolution horaire sur les 3 derniers jours.
        - L’évolution du niveau d’eau depuis le début de l’année.

## Configuration

### Fichier ignore_dates.yaml :
Ce fichier contient la liste des dates (au format jj-mm-aaaa) à ignorer lors de l’importation des données.
Exemple :
ignore_dates:
- 04-09-2021
- 07-09-2021
- 19-10-2022
- 20-10-2022
- 21-10-2022
- 22-10-2022
- 19-08-2023
- 21-06-2024
- 22-06-2024
- 17-02-2025
- 18-02-2025

### Base de données :
Le fichier SQLite niveau_eau.db est créé et mis à jour automatiquement par le projet. La table water_level comporte les colonnes :
- id (PRIMARY KEY, autoincrement)
- date_event (DATE)
- datetime_event (DATETIME, UNIQUE)
- value (REAL)
- unit (TEXT)