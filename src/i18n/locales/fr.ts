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
    /**
     * Nom du produit. En minuscules dans les trois langues, ce n'est pas une
     * coquille : les capitales de `NOM` (App.vue) sont un logotype, pas le nom.
     * Un nom propre ne se traduit pas non plus. `title` sert de `document.title`.
     * Voir aussi le <title> de index.html, qui est statique.
     */
    name: 'bloub',
    title: 'bloub — avatar SVG animé',
    botAria: 'Avatar bloub animé'
  },

  gallery: {
    back: 'Retour au lecteur'
  },

  rail: {
    nav: 'Sections',
    customize: 'Personnaliser',
    animations: 'Animations',
    settings: 'Réglages'
  },

  panel: {
    /**
     * Au SINGULIER, comme les trois autres : un titre de grille nomme ce qu'un
     * clic pose, pas le nombre de vignettes proposees. Le pluriel reste au rail,
     * qui nomme la vue et non le choix (`rail.animations`).
     */
    animations: 'Animation',
    shape: 'Forme',
    expression: 'Expression',
    color: 'Couleur'
  },

  preview: {
    exit: "Quitter l'aperçu",
    /** Nom de la touche tel qu'il est grave sur le clavier de la langue. */
    key: 'Échap'
  },

  timeline: {
    play: 'Lancer la lecture',
    pause: 'Arrêter la lecture',
    addAnimation: 'Ajouter une animation',
    preview: 'Aperçu',
    zoom: 'Zoom de la piste',
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
    about: 'À propos',
    credits: 'Créé avec ❤️ par {name}',
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
    comet: 'Comète',
    swirl: 'Tourbillon'
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
