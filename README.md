# 🐹 Cours, petit hamster

Petite application web (JavaScript vanilla, sans backend) qui génère un programme d'entraînement de course à pied
(10 km, semi-marathon, marathon) à partir de la date de la course, de l'objectif de temps et des jours disponibles,
puis l'exporte comme séances structurées dans le calendrier [intervals.icu](https://intervals.icu).

## Démarrage

Sous Windows, double-clique sur **`demarrer.bat`** : il installe les dépendances au premier lancement, démarre le
serveur et ouvre la page dans le navigateur. La fenêtre reste ouverte tant que l'application tourne.

En ligne de commande :

```bash
npm install
# renseigner INTERVALS_API_KEY et INTERVALS_ATHLETE_ID dans le fichier .env (déjà créé, vide)
npm start                 # démarre et ouvre http://localhost:5173 (ou "npm run dev" sans ouvrir le navigateur)
```

- **Clé API** : intervals.icu → *Settings* → *Developer Settings* → *API Key*.
- **Identifiant athlète** : visible dans l'URL de ton profil (`i12345`).

Le fichier `.env` est lu par Vite au démarrage et ses variables `INTERVALS_*` sont injectées dans la page. Il n'y a
aucun serveur applicatif : le navigateur appelle directement l'API intervals.icu (qui autorise les requêtes
cross-origin). Ne déploie pas le build (`npm run build`) sur un site public, la clé y serait embarquée.

Ouvrir `index.html` directement (double-clic, aperçu de fichier) ne suffit pas : sans Vite, le script et le `.env` ne
sont pas chargés. Passe toujours par `demarrer.bat` ou `npm start`.

`npm test` lance les tests de la logique de génération (Node ≥ 22, sans dépendance).

## Fonctionnement

1. **Paramètres** : date, distance, objectif, jours de la semaine. Chaque jour reçoit un rôle : *Qualité*,
   *Footing* ou *Sortie longue* (exactement une sortie longue, au plus deux jours de qualité).
2. **Programme** : affiché semaine par semaine avec, pour chaque séance, la description « à la Runna » et le texte
   structuré tel qu'il sera envoyé à intervals.icu.
3. **Export** : après confirmation, les séances sont créées en une requête (`POST /events/bulk?upsert=true`). Par
   défaut, les séances déjà créées par l'application sur la période sont d'abord supprimées, pour éviter les
   doublons si tu régénères le plan avec d'autres jours. Un bouton permet aussi de tout retirer.

## Méthode d'entraînement

- **Allures** : formule VDOT de Jack Daniels à partir de l'objectif. Footing entre 64 % et 76 % du VDOT (la borne
  haute est la limite « pas plus vite que »), seuil ≈ 88 %, intervalles ≈ 98,5 %, lignes droites ≈ 107 %. Les
  allures marathon / semi / 10 km équivalentes servent aux blocs à allure spécifique.
- **Semaine type** (3 jours) : une séance de qualité qui alterne intervalles (300 m variables, 400 à 1 600 m) et
  tempo (2 km → 8 km, « 2-1-1 », « 3-2-1 »…), un footing facile, une sortie longue. Avec 4 ou 5 jours, les jours
  supplémentaires sont des footings ; un second jour de qualité ajoute un tempo chaque semaine.
- **Périodisation** : base (≈ 35 % des semaines de construction), développement, affûtage. Une semaine allégée
  toutes les quatre semaines (volume −20 %, séance de qualité remplacée par une course progressive ou un fartlek à
  allure de course). La sortie longue progresse de +2 à +3 km/semaine maximum jusqu'au pic, situé deux semaines
  avant la course (trois pour le marathon), puis descend à 60 % (10 km, semi) ou 68 % puis 50 % (marathon).
- **Sorties longues** : faciles en base et en récupération ; en développement, alternance entre progressive (fin à
  allure marathon puis seuil) et bloc à allure de course au milieu (seuil pour le 10 km, allure semi ou marathon
  sinon), le bloc grandissant jusqu'à 30 à 55 % de la sortie.
- **Semaine de course** : intervalles d'affûtage courts à l'allure de course, footing avec lignes droites, repos
  la veille, et l'événement *Course* (catégorie `RACE_A`) le jour J avec la distance et le temps visé.

Références : *Daniels' Running Formula* (J. Daniels), *Advanced Marathoning* (P. Pfitzinger), *Hansons Marathon
Method*, et la structure des plans Runna.

## Format des séances intervals.icu

Chaque séance est envoyée en texte structuré (allures absolues, donc indépendant des zones configurées dans
intervals.icu) :

```
Échauffement
- Échauffement 1.5km 7:10-6:15/km Pace

Série 4x
- Rapide 800mtr 5:15-4:55/km Pace
- Récup marche 90s

Retour au calme
- Retour au calme 1km 7:10-6:15/km Pace
```

intervals.icu en déduit la durée et la distance planifiées, et peut pousser la séance vers une montre (Garmin,
Coros, etc.) si la synchronisation est activée.

## Application Wear OS

Le dossier [`wear/`](wear/README.md) contient une application Galaxy Watch (Kotlin, Compose pour Wear OS) : un
bouton qui lance une course dans Samsung Health avec l'objectif de la séance en rappel, et un écran d'exploration
des points d'entrée de Samsung Health. Voir son README pour compiler et installer sur la montre.

## Structure

```
index.html          page
src/main.js         contrôleur (formulaire, export, confirmation)
src/plan.js         périodisation et calendrier
src/workouts.js     modèles de séances + format texte intervals.icu
src/paces.js        VDOT et allures d'entraînement
src/intervals.js    client API intervals.icu
src/render.js       rendu DOM
src/format.js       formatage et dates
test/               tests (node --test)
```
