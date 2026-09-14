import { defineConfig } from 'vite';

// Les variables INTERVALS_* du fichier .env sont exposées au navigateur via import.meta.env.
// Il n'y a aucun serveur applicatif : Vite ne sert que les fichiers statiques.
export default defineConfig({
  envPrefix: 'INTERVALS_',
  base: './',
  server: { port: 5173 },
});
