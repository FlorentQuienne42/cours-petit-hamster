@echo off
setlocal
title Cours, petit hamster
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm introuvable. Installe Node.js depuis https://nodejs.org puis relance ce script.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo L'installation a echoue.
    pause
    exit /b 1
  )
)

if not exist .env (
  copy .env.example .env >nul
  echo Fichier .env cree : renseigne INTERVALS_API_KEY et INTERVALS_ATHLETE_ID dedans.
)

echo Demarrage de Cours, petit hamster... la page s'ouvre dans le navigateur.
echo Laisse cette fenetre ouverte tant que tu utilises l'application (ferme-la pour arreter).
echo.
call npm start
pause
