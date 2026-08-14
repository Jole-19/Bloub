import type fr from './fr'

/**
 * Le type `typeof fr` est le verrou : une cle oubliee ou mal orthographiee est
 * une erreur de compilation nommee, pas une chaine manquante decouverte a
 * l'ecran.
 */
const en: typeof fr = {
  app: {
    name: 'Grok bot',
    title: 'Grok bot — animated SVG avatar',
    botAria: 'Animated Grok avatar'
  },

  gallery: {
    back: 'Back to the player'
  },

  rail: {
    nav: 'Sections',
    customize: 'Customise',
    customizeHint: 'Shape, expression and colour',
    animations: 'Animations',
    animationsHint: 'Play and trigger the states',
    settings: 'Settings',
    settingsHint: 'Language and about'
  },

  panel: {
    animations: 'Animations',
    shape: 'Shape',
    expression: 'Expression',
    color: 'Colour'
  },

  timeline: {
    play: 'Start playback',
    pause: 'Stop playback',
    zoomIn: 'Zoom in on the track',
    zoomOut: 'Zoom out of the track',
    addAnimation: 'Add an animation',
    blockAria: '{state}, {duration}',
    blockDurationAria: 'Duration of {state}, {duration}',
    blockRemoveAria: 'Remove {state}'
  },

  dialog: {
    cancel: 'Cancel',
    nameCreateTitle: 'New cycle',
    nameRenameTitle: 'Rename cycle',
    nameField: 'Cycle name',
    nameCreate: 'Create',
    nameRename: 'Rename',
    removeTitle: 'Delete "{name}"?',
    removeDetail:
      'This sequence will be lost, along with its animation. | This sequence will be lost, along with its {n} animations.',
    removeConfirm: 'Delete'
  },

  cycles: {
    defaultName: 'Default cycle',
    newName: 'My cycle',
    menuNew: 'New cycle',
    menuRenameAria: 'Rename {name}',
    menuRemoveAria: 'Delete {name}'
  },

  units: {
    seconds: '{n} s',
    secondsShort: '{n}s'
  },

  settings: {
    title: 'Settings',
    language: 'Language',
    languageHint: 'Detected from your browser on your first visit.',
    about: 'About',
    credits: 'Made by {name}',
    creditsAria: 'Jérémy on X, in a new tab',
    github: 'View the project on GitHub',
    githubAria: 'The project repository on GitHub, in a new tab'
  },

  states: {
    idle: 'Idle',
    thinking: 'Thinking',
    wink: 'Wink',
    wide: 'Wide eyes',
    alert: 'Alert',
    notify: 'Notification',
    exclaim: 'Exclamation',
    sleep: 'Sleep',
    egg: 'Egg',
    hexagon: 'Hexagon',
    play: 'Play',
    orbit: 'Orbit',
    burst: 'Burst',
    comet: 'Comet'
  },

  shapes: {
    cercle: 'Circle',
    galet: 'Pebble',
    squircle: 'Squircle',
    capsule: 'Capsule',
    triangle: 'Triangle',
    hexagone: 'Hexagon',
    nuage: 'Cloud',
    goutte: 'Droplet'
  },

  colors: {
    encre: 'Ink',
    creme: 'Cream',
    brun: 'Brown',
    rouge: 'Red',
    orange: 'Orange',
    ambre: 'Amber',
    vert: 'Green',
    turquoise: 'Turquoise',
    bleu: 'Blue',
    violet: 'Purple',
    rose: 'Pink',
    gris: 'Grey'
  },

  expressions: {
    neutre: 'Neutral',
    attentif: 'Attentive',
    surpris: 'Surprised',
    excite: 'Excited',
    heureux: 'Happy',
    hilare: 'Laughing',
    colere: 'Angry',
    triste: 'Sad',
    effraye: 'Scared',
    mefiant: 'Suspicious',
    confus: 'Confused',
    curieux: 'Curious',
    fier: 'Proud',
    timide: 'Shy',
    blase: 'Unimpressed',
    somnolent: 'Sleepy'
  }
}

export default en
