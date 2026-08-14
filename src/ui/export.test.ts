import { describe, expect, it } from 'vitest'
import { SHAPES } from '@/bot/skins'
import {
  ACTIONS,
  ACTION_BY_ID,
  ACTION_DEFAUT,
  DEMI_CADRE,
  RAYON_MAX,
  nomFichier,
  sansCommentaires,
  viewBoxExport
} from './export'

/** Rayon de la boule au repos, cf. le `R` de BloubBot.vue. */
const RAYON_BOULE = 100

/** Demi-cote du viewBox affiche a l'ecran, cf. le `VB` de BloubBot.vue. */
const VB_ECRAN = 158

describe('cadre d export', () => {
  /*
   * LE test du fichier : le cadre est plus serre que l'ecran, donc c'est lui qui
   * decide ce qui rentre. Une forme ajoutee a `skins.ts` avec un rayon plus
   * grand que la marge se ferait rogner en silence sur l'image exportee.
   */
  it('contient toutes les formes du personnalisateur', () => {
    for (const forme of SHAPES) {
      const rayon = Math.max(...forme.radii) * RAYON_BOULE
      expect(rayon, `la forme « ${forme.id} » depasse du cadre`).toBeLessThan(DEMI_CADRE)
    }
  })

  it('laisse une marge pour le rognage circulaire d une photo de profil', () => {
    // La boule au repos ne doit pas toucher le bord : entre 70 % et 90 % du cadre.
    const remplissage = RAYON_BOULE / DEMI_CADRE
    expect(remplissage).toBeGreaterThan(0.7)
    expect(remplissage).toBeLessThan(0.9)
  })

  it('est plus serre que le viewBox de l ecran', () => {
    // La marge de l'ecran loge les anneaux des etats animes, absents au repos :
    // la garder remplirait l'export de vide.
    expect(DEMI_CADRE).toBeLessThan(VB_ECRAN)
  })

  it('se cadre sur la forme la plus etalee et non sur le cercle', () => {
    // Le squircle culmine a 1.15 sur sa diagonale : un cadre calcule sur le
    // cercle seul (1.0) le rognerait.
    expect(RAYON_MAX).toBeGreaterThan(1)
    expect(RAYON_MAX).toBe(Math.max(...SHAPES.map((f) => Math.max(...f.radii))))
  })

  it('produit un viewBox carre centre sur la boule', () => {
    expect(viewBoxExport(125)).toBe('-125 -125 250 250')
    expect(viewBoxExport()).toBe(`${-DEMI_CADRE} ${-DEMI_CADRE} ${DEMI_CADRE * 2} ${DEMI_CADRE * 2}`)
  })
})

describe('catalogue des exports', () => {
  it('a des ids uniques', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length)
  })

  it('expose une action par defaut qui existe', () => {
    expect(ACTION_BY_ID.get(ACTION_DEFAUT)).toBeDefined()
  })

  /*
   * Une seule taille de PNG : proposer 1024 et 2048 faisait trancher a
   * l'utilisateur une question qui n'est pas la sienne.
   */
  it('ne propose qu un seul png a telecharger', () => {
    const pngs = ACTIONS.filter((a) => a.mode === 'telecharge' && a.extension === 'png')
    expect(pngs).toHaveLength(1)
  })

  /* Le presse-papiers image ne sait ecrire que du bitmap ; le SVG passe en texte. */
  it('copie le bitmap en image et le vectoriel en texte', () => {
    for (const action of ACTIONS) {
      if (action.mode === 'copieImage') expect(action.extension).toBe('png')
      if (action.mode === 'copieTexte') expect(action.extension).toBe('svg')
    }
  })

  it('propose de copier les deux formats', () => {
    expect(ACTIONS.some((a) => a.mode === 'copieImage')).toBe(true)
    expect(ACTIONS.some((a) => a.mode === 'copieTexte')).toBe(true)
  })

  it('donne une taille exploitable a chaque action', () => {
    for (const action of ACTIONS) {
      expect(action.taille).toBeGreaterThan(0)
      expect(Number.isFinite(action.taille)).toBe(true)
    }
  })
})

describe('nettoyage du markup', () => {
  it('retire les commentaires sans toucher au dessin', () => {
    const markup =
      '<defs><!-- les yeux sont de vrais trous --><mask id="m">' +
      '<path d="M0 0" fill="#fff"/></mask></defs>' +
      '<g mask="url(#m)"><rect fill="#0a0a0c"/></g>'
    const propre = sansCommentaires(markup)
    expect(propre).not.toContain('<!--')
    expect(propre).not.toContain('trous')
    // Ce qui fait le dessin doit survivre intact.
    expect(propre).toContain('fill="#fff"')
    expect(propre).toContain('fill="#0a0a0c"')
    expect(propre).toContain('mask="url(#m)"')
    expect(propre).toContain('d="M0 0"')
  })

  it('retire un commentaire multiligne', () => {
    expect(sansCommentaires('<a/><!--\n  deux\n  lignes\n--><b/>')).toBe('<a/><b/>')
  })

  it('laisse un markup sans commentaire tel quel', () => {
    expect(sansCommentaires('<circle r="100"/>')).toBe('<circle r="100"/>')
  })
})

describe('nom de fichier', () => {
  it('se construit sur les ids et pas sur les libelles', () => {
    expect(nomFichier('goutte', 'neutre', 'encre', 'png')).toBe('bloub-goutte-neutre-encre.png')
    expect(nomFichier('cercle', 'hilare', 'violet', 'svg')).toBe('bloub-cercle-hilare-violet.svg')
  })

  /*
   * `App.vue` relit forme / expression / couleur du localStorage sans les
   * valider : une valeur trafiquee ne doit pas pouvoir composer un chemin.
   */
  it('ne laisse pas passer de separateur de chemin', () => {
    const nom = nomFichier('../../etc/passwd', 'neutre', 'encre', 'png')
    expect(nom).not.toContain('/')
    // Un seul point, celui de l'extension.
    expect(nom.split('.')).toHaveLength(2)
    expect(nom.endsWith('.png')).toBe(true)
  })

  it('survit a des ids vides', () => {
    expect(nomFichier('', '', '', 'png')).toBe('bloub.png')
  })
})
