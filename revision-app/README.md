# Révise — Outil de révision intelligent

Application web qui lit un PDF, identifie automatiquement les axes clés, génère des questions adaptées (QCM + ouvertes) et priorise vos points faibles dans des quiz ciblés.

## ✨ Fonctionnalités

- **Upload PDF** : extraction automatique du texte via pdf.js
- **Analyse IA** : détection des 4-7 axes/chapitres principaux
- **Questions variées** : QCM et questions ouvertes, 3 niveaux de difficulté
- **3 modes de quiz** :
  - 🌟 Équilibré : couverture de tous les axes
  - 🔥 Points faibles : focus sur vos axes les moins maîtrisés
  - ⏰ Révision espacée : questions à revoir selon le temps/score
- **Suivi de progression** : maîtrise en % par axe, historique, streaks
- **Statistiques détaillées** : graphique d'évolution, classement des axes
- **Correction intelligente** : les réponses ouvertes sont évaluées par l'IA
- **Sauvegarde locale** : tout reste dans votre navigateur

## 🚀 Installation

### Prérequis
- Node.js 18+ installé ([télécharger](https://nodejs.org/))
- Une clé API Anthropic ([obtenir ici](https://console.anthropic.com/settings/keys))

### Étapes

1. **Ouvrir le projet dans VSCode**
   ```bash
   cd revision-app
   code .
   ```

2. **Installer les dépendances** (dans le terminal intégré de VSCode)
   ```bash
   npm install
   ```

3. **Lancer le serveur de développement**
   ```bash
   npm run dev
   ```

4. **Ouvrir le navigateur** sur `http://localhost:5173`

5. **Configurer votre clé API** à la première ouverture (icône ⚙️ en haut à droite)

## 🛠️ Scripts disponibles

```bash
npm run dev       # Serveur de développement (localhost:5173)
npm run build     # Build de production dans /dist
npm run preview   # Prévisualiser le build de production
```

## 📁 Structure du projet

```
revision-app/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── ApiKeyModal.jsx    # Modal de config de la clé API
│   ├── api.js                  # Wrapper API Anthropic
│   ├── App.jsx                 # Composant principal + toutes les vues
│   ├── index.css               # Styles Tailwind + custom
│   ├── main.jsx                # Point d'entrée React
│   ├── pdfExtractor.js         # Extraction texte depuis PDF
│   └── storage.js              # Wrapper localStorage
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── vite.config.js
```

## 🔐 Sécurité & vie privée

- Votre clé API est stockée **uniquement dans le localStorage** de votre navigateur
- Les appels sont faits **directement** à l'API Anthropic depuis le navigateur
- Aucun serveur tiers n'intercepte vos données
- Le texte de vos PDF et votre progression restent **en local**

⚠️ **Important** : l'appel direct au navigateur utilise le header `anthropic-dangerous-direct-browser-access`. En production publique, il est recommandé de mettre en place un backend proxy pour protéger votre clé. Pour un usage personnel local, c'est parfait.

## 🧹 Réinitialisation

- Bouton 🗑️ en haut à droite : efface le document et la progression
- Bouton ⚙️ : reconfigure la clé API
- Pour tout effacer : `localStorage.clear()` dans la console du navigateur

## 📝 Notes

- Les PDF doivent contenir du **texte sélectionnable** (pas seulement des images scannées)
- La génération initiale (analyse + questions) prend 10-30 secondes selon la taille du PDF
- Le modèle utilisé est `claude-sonnet-4-20250514` — vous pouvez le changer dans `src/api.js`

## 🎨 Personnalisation

- **Couleurs / thème** : modifiez les classes Tailwind dans `App.jsx` (actuellement stone + orange)
- **Polices** : remplacez Fraunces / JetBrains Mono dans `index.html` et `tailwind.config.js`
- **Nombre de questions par quiz** : dans `App.jsx`, cherchez `slice(0, Math.min(8, pool.length))`
- **Modèle Claude** : dans `src/api.js`, changez la valeur par défaut de `model`

## 🐛 Problèmes courants

**"Erreur API (401)"** → clé invalide ou expirée, reconfigurez-la
**"Erreur API (429)"** → rate limit atteint, attendez quelques secondes
**"Le PDF semble vide"** → le PDF est probablement scanné, utilisez un PDF avec texte
**L'extraction PDF plante** → essayez un PDF plus petit (<10 Mo)

---

Bon courage dans vos révisions ! 📚
