# 🐹 Petit hamster · Wear OS

Application Wear OS (Kotlin, Compose pour Wear OS) pour Galaxy Watch : un bouton qui lance une course dans
Samsung Health, avec l'objectif de la séance en rappel (2 km à 6:00/km par défaut).

## Ce que fait l'app

- **Écran principal** : le bouton « Course 2 km · 6:00/km » essaie, dans l'ordre, plusieurs points d'entrée de
  Samsung Health et affiche celui qui a fonctionné :
  1. l'intent standard Google Fit `vnd.google.fitness.TRACK` (type `vnd.google.fitness.activity/running`,
     extra `actionStatus=ActiveActionStatus`), celui que Google Assistant émet pour « démarrer une course »,
     ciblé sur le paquet Samsung Health ;
  2. un lien profond `samsunghealth://shealth.samsung.com/deepLink?sc_id=tracker.sport&action=start&sport_type=1002`
     (forme connue sur téléphone, à confirmer sur la montre) ;
  3. l'ouverture de Samsung Health.
- **Écran « Explorer Samsung Health »** : liste chaque stratégie (avec l'indication « répond / ne répond pas ») et
  toutes les activités exportées par Samsung Health sur la montre, chacune lançable d'un tap. C'est l'outil pour
  trouver le point d'entrée exact qui démarre directement la course sur ta montre.

## Limite connue

Samsung ne publie pas d'API permettant à une autre application de démarrer un exercice Samsung Health, et
aucune ne permet de lui transmettre une cible (distance, allure). L'objectif « 2 km à 6:00/km » est donc affiché
par l'app mais doit être réglé dans Samsung Health (cible Distance) ou suivi à l'écran. Pour un vrai guidage
d'allure (vibration si trop lent ou trop vite, arrêt à 2 km), l'étape suivante est de faire enregistrer la séance
par l'app elle-même avec l'API Health Services de Wear OS, puis de la partager via Health Connect.

## Compiler

Prérequis : JDK 17 ou plus récent, SDK Android (plateforme 36, build-tools 35) déclaré dans `local.properties`
(`sdk.dir=…`) ou via la variable `ANDROID_HOME`.

```bash
cd wear
./gradlew assembleDebug        # Windows : gradlew.bat assembleDebug
```

L'APK est produit dans `app/build/outputs/apk/debug/app-debug.apk`. Le projet s'ouvre aussi directement dans
Android Studio (dossier `wear`).

## Installer sur la montre

1. Sur la montre : Paramètres → À propos de la montre → Informations sur le logiciel, taper 7 fois sur
   « Version du logiciel » pour activer les options de développement, puis activer **Débogage ADB** et
   **Débogage sans fil** (noter l'adresse IP et le port affichés).
2. Sur le PC, montre et PC sur le même Wi-Fi :

```bash
adb connect 192.168.x.y:5555
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`adb` est dans `%LOCALAPPDATA%\Android\Sdk\platform-tools`. Les Galaxy Watch récentes demandent d'accepter la
connexion sur la montre au premier `adb connect`.

## Structure

```
app/src/main/kotlin/fr/petithamster/wear/
  MainActivity.kt            écrans Compose (principal + explorateur)
  SamsungHealthLauncher.kt   cascade de lancement, exploration des activités exportées
  RunGoal.kt                 objectif de séance (distance, allure, temps visé)
app/src/main/AndroidManifest.xml   app autonome, visibilité du paquet Samsung Health
gradle/libs.versions.toml          versions (AGP 8.13, Kotlin 2.2, Compose Wear 1.6)
```
