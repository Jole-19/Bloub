/**
 * Locale de reference. Les deux autres sont typees `typeof fr`, donc c'est ce
 * fichier qui definit le contrat : y ajouter une cle fait echouer `vue-tsc` sur
 * `en.ts` et `zh.ts` jusqu'a ce qu'elles soient traduites.
 *
 * Surtout PAS de `as const` : chaque valeur deviendrait son propre type
 * litteral, et toute traduction serait alors refusee comme n'etant pas la
 * chaine francaise.
 *
 * Les guillemets et les espaces font partie de la traduction, pas du code : le
 * francais veut « ... » avec espaces insecables, l'anglais "...", le chinois
 * n'a pas d'espace avant ses unites. Aucun composant ne doit les ajouter.
 */
export default {
  app: {
    /** Nom du produit. Voir aussi le <title> de index.html, qui est statique. */
    name: 'Grok bot',
    title: 'Grok bot — avatar SVG animé',
    botAria: 'Avatar Grok animé'
  },

  gallery: {
    back: 'Retour au lecteur'
  },

  rail: {
    nav: 'Sections',
    customize: 'Personnaliser',
    customizeHint: 'Forme, expression et couleur',
    animations: 'Animations',
    animationsHint: 'Jouer et déclencher les états',
    settings: 'Réglages',
    settingsHint: 'Langue et à propos'
  },

  panel: {
    animations: 'Animations',
    shape: 'Forme',
    expression: 'Expression',
    color: 'Couleur'
  },

  timeline: {
    play: 'Lancer la lecture',
    pause: 'Arrêter la lecture',
    zoomIn: 'Zoomer la piste',
    zoomOut: 'Dézoomer la piste',
    addAnimation: 'Ajouter une animation',
    blockAria: '{state}, {duration}',
    blockDurationAria: 'Durée de {state}, {duration}',
    blockRemoveAria: 'Retirer {state}'
  },

  dialog: {
    cancel: 'Annuler',
    nameCreateTitle: 'Nouveau cycle',
    nameRenameTitle: 'Renommer le cycle',
    nameField: 'Nom du cycle',
    nameCreate: 'Créer',
    nameRename: 'Renommer',
    removeTitle: 'Supprimer « {name} » ?',
    removeDetail:
      'Ce montage sera perdu, avec son animation. | Ce montage sera perdu, avec ses {n} animations.',
    removeConfirm: 'Supprimer'
  },

  cycles: {
    defaultName: 'Cycle par défaut',
    newName: 'Mon cycle',
    menuNew: 'Nouveau cycle',
    menuRenameAria: 'Renommer {name}',
    menuRemoveAria: 'Supprimer {name}'
  },

  units: {
    seconds: '{n} s',
    /** Graduation de la règle : serré, le chiffre est déjà petit. */
    secondsShort: '{n}s'
  },

  settings: {
    title: 'Réglages',
    language: 'Langue',
    languageHint: 'Détectée depuis votre navigateur au premier passage.',
    about: 'À propos',
    credits: 'Créé par {name}',
    creditsAria: 'Jérémy sur X, dans un nouvel onglet',
    github: 'Voir le projet sur GitHub',
    githubAria: 'Le dépôt du projet sur GitHub, dans un nouvel onglet'
  },

  states: {
    idle: 'Repos',
    thinking: 'Réflexion',
    wink: "Clin d'œil",
    wide: 'Yeux écarquillés',
    alert: 'Alerte',
    notify: 'Notification',
    exclaim: 'Exclamation',
    sleep: 'Veille',
    egg: 'Œuf',
    hexagon: 'Hexagone',
    play: 'Lecture',
    orbit: 'Orbite',
    burst: 'Éclatement',
    comet: 'Comète'
  },

  shapes: {
    cercle: 'Cercle',
    galet: 'Galet',
    squircle: 'Squircle',
    capsule: 'Capsule',
    triangle: 'Triangle',
    hexagone: 'Hexagone',
    nuage: 'Nuage',
    goutte: 'Goutte'
  },

  colors: {
    encre: 'Encre',
    creme: 'Crème',
    brun: 'Brun',
    rouge: 'Rouge',
    orange: 'Orange',
    ambre: 'Ambre',
    vert: 'Vert',
    turquoise: 'Turquoise',
    bleu: 'Bleu',
    violet: 'Violet',
    rose: 'Rose',
    gris: 'Gris'
  },

  expressions: {
    neutre: 'Neutre',
    attentif: 'Attentif',
    surpris: 'Surpris',
    excite: 'Excité',
    heureux: 'Heureux',
    hilare: 'Hilare',
    colere: 'En colère',
    triste: 'Triste',
    effraye: 'Effrayé',
    mefiant: 'Méfiant',
    confus: 'Confus',
    curieux: 'Curieux',
    fier: 'Fier',
    timide: 'Timide',
    blase: 'Blasé',
    somnolent: 'Somnolent'
  }
}
