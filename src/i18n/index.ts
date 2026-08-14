import { computed, ref, watchEffect } from 'vue'
import { choisirLangue, estLangue, type Langue, tagDe } from './langues'
import fr from './locales/fr'
import en from './locales/en'
import zh from './locales/zh'

export { LANGUES, type Langue } from './langues'

/**
 * `Record<Langue, typeof fr>` et pas un objet libre : ajouter une langue a
 * `LANGUES` sans ecrire son dictionnaire devient une erreur de compilation.
 */
const dictionnaires: Record<Langue, typeof fr> = { fr, en, zh }

/**
 * Chemins pointes du dictionnaire. C'est ce type qui fait que `t('reglage.x')`
 * ne compile pas : la signature de `t` n'accepte rien d'autre qu'une cle qui
 * existe vraiment dans `fr.ts`.
 */
type Chemins<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Chemins<T[K], `${P}${K}.`>
}[keyof T & string]

export type Cle = Chemins<typeof fr>

const CLE_STOCKAGE = 'grokbot:langue'

const courante = ref<Langue>(
  choisirLangue(localStorage.getItem(CLE_STOCKAGE), navigator.languages ?? [navigator.language])
)

/**
 * Langue courante, en lecture et en ecriture (`v-model` compris).
 *
 * L'ecriture seule ecrit dans le stockage : la langue DETECTEE ne s'y inscrit
 * pas. Sans cette distinction, un premier passage depuis l'Angleterre figerait
 * l'anglais pour toujours, alors que la detection doit rester une hypothese
 * qu'on refait a chaque visite tant que l'utilisateur n'a pas tranche.
 */
export const langue = computed<Langue>({
  get: () => courante.value,
  set: (valeur) => {
    if (!estLangue(valeur)) return
    courante.value = valeur
    localStorage.setItem(CLE_STOCKAGE, valeur)
  }
})

const dictionnaire = computed(() => dictionnaires[courante.value])

/** Etiquette BCP 47 de la langue courante, pour `Intl` et l'attribut `lang`. */
const tag = computed(() => tagDe(courante.value))

/**
 * L'attribut `lang` du document suit la langue : c'est lui qui fait choisir la
 * bonne voix au lecteur d'ecran et les bonnes regles de cesure. Le titre de
 * l'onglet suit aussi — `index.html` ne peut en porter qu'un, statique.
 */
watchEffect(() => {
  document.documentElement.lang = tag.value
  document.title = t('app.title')
})

/** Les formateurs sont chers a construire et relus a chaque image de la piste. */
const formateurs = new Map<string, Intl.NumberFormat>()

function formateur(decimales: number): Intl.NumberFormat {
  const memo = `${tag.value}:${decimales}`
  let f = formateurs.get(memo)
  if (!f) {
    f = new Intl.NumberFormat(tag.value, {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    })
    formateurs.set(memo, f)
  }
  return f
}

/**
 * Nombre dans la convention de la langue. Indispensable pour les durees : le
 * separateur decimal est une virgule en francais et un point en anglais, et le
 * `.replace('.', ',')` qui tenait lieu de formatage etait donc faux des qu'on
 * quittait le francais.
 */
export function nombre(valeur: number, decimales = 0): string {
  return formateur(decimales).format(valeur)
}

function interpoler(texte: string, valeurs?: Record<string, string | number>): string {
  if (!valeurs) return texte
  let sortie = texte
  for (const [nom, valeur] of Object.entries(valeurs)) {
    sortie = sortie.replaceAll(`{${nom}}`, String(valeur))
  }
  return sortie
}

function brut(cle: Cle): string {
  return cle
    .split('.')
    .reduce<unknown>((noeud, k) => (noeud as Record<string, unknown>)[k], dictionnaire.value) as string
}

/** `t('panel.shape')`, `t('cycles.menuRenameAria', { name })`. */
export function t(cle: Cle, valeurs?: Record<string, string | number>): string {
  return interpoler(brut(cle), valeurs)
}

/**
 * Pluriel. Les formes sont separees par ` | ` dans le dictionnaire, dans l'ordre
 * singulier puis pluriel, et c'est `Intl.PluralRules` qui tranche — le francais
 * compte 0 comme un singulier, l'anglais non, et le chinois n'a qu'une forme
 * (une seule forme ecrite suffit alors, sans separateur).
 */
export function pluriel(cle: Cle, n: number, valeurs?: Record<string, string | number>): string {
  const formes = brut(cle).split(' | ')
  const index = new Intl.PluralRules(tag.value).select(n) === 'one' ? 0 : 1
  return interpoler(formes[index] ?? formes[0]!, { n, ...valeurs })
}

/**
 * Nom d'un montage. Un nom vide est celui du montage d'amorce, que l'utilisateur
 * n'a jamais nomme : il suit donc la langue. Type structurel plutot que `Cycle`
 * importe, pour que la couche i18n ne depende pas de `src/bot/`.
 */
export function nomDeCycle(cycle: { name: string }): string {
  return cycle.name || t('cycles.defaultName')
}

/** Duree lisible : `2,4 s`, `2.4 s`, `2.4 秒`. */
export function secondes(valeur: number): string {
  return t('units.seconds', { n: nombre(valeur, 1) })
}

/**
 * Meme duree, serree, pour la graduation de la regle : elle est chiffree tous
 * les 52 px et une espace de plus y ferait chevaucher les etiquettes.
 */
export function secondesCourtes(valeur: number, decimales: number): string {
  return t('units.secondsShort', { n: nombre(valeur, decimales) })
}
