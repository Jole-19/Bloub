import { describe, expect, it } from 'vitest'
import { litWebp, webpAnime } from './anime'

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))
const le = (v: number, n: number) => {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push((v / 2 ** (8 * i)) & 0xff)
  return out
}
const chunk = (id: string, d: number[]) => {
  const out = [...ascii(id), ...le(d.length, 4), ...d]
  if (d.length % 2) out.push(0)
  return out
}

/** Fabrique un WebP fixe plausible, comme celui que rend `canvas.toBlob`. */
function faux(opts: { alpha?: boolean; icc?: boolean; sansPerte?: boolean } = {}) {
  const corps = [
    ...ascii('WEBP'),
    ...chunk('VP8X', [0x10, 0, 0, 0, ...le(63, 3), ...le(63, 3)]),
    ...(opts.icc ? chunk('ICCP', new Array(456).fill(7)) : []),
    ...(opts.alpha ? chunk('ALPH', [1, 2, 3]) : []),
    ...chunk(opts.sansPerte ? 'VP8L' : 'VP8 ', [9, 9, 9, 9])
  ]
  return new Uint8Array([...ascii('RIFF'), ...le(corps.length, 4), ...corps])
}

/** Relit un conteneur RIFF : renvoie les identifiants et tailles, dans l'ordre. */
function chunks(f: Uint8Array) {
  const lis4 = (o: number) => String.fromCharCode(...f.subarray(o, o + 4))
  const out: { id: string; taille: number; debut: number }[] = []
  let o = 12
  while (o + 8 <= f.length) {
    const taille = f[o + 4]! + f[o + 5]! * 256 + f[o + 6]! * 65536 + f[o + 7]! * 16777216
    out.push({ id: lis4(o), taille, debut: o + 8 })
    o += 8 + taille + (taille % 2)
  }
  return out
}

describe('lecture d un webp fixe', () => {
  it('recupere le flux d image et le plan alpha', () => {
    const m = litWebp(faux({ alpha: true }))
    expect(String.fromCharCode(...m.image.slice(0, 4))).toBe('VP8 ')
    expect(m.alpha).not.toBeNull()
    expect(m.transparente).toBe(true)
  })

  /* 456 octets de profil de couleur PAR IMAGE pour un aplat de deux teintes. */
  it('jette l ICCP que le navigateur ajoute', () => {
    const m = litWebp(faux({ alpha: true, icc: true }))
    expect(m.image.length).toBeLessThan(64)
    expect(m.alpha!.length).toBeLessThan(64)
  })

  /* Le sans-perte porte son alpha dans son propre flux, sans chunk separe. */
  it('voit la transparence d un VP8L sans chunk ALPH', () => {
    const m = litWebp(faux({ sansPerte: true }))
    expect(m.alpha).toBeNull()
    expect(m.transparente).toBe(true)
  })

  it('refuse ce qui n est pas un webp', () => {
    expect(() => litWebp(new Uint8Array(32))).toThrow()
    expect(() => litWebp(new Uint8Array(4))).toThrow()
  })
})

describe('assemblage de l animation', () => {
  const images = [faux({ alpha: true, icc: true }), faux({ alpha: true }), faux({ alpha: true })]

  it('produit un RIFF WEBP dont la taille declaree est juste', () => {
    const f = webpAnime(images, 64, 64, 50)
    expect(String.fromCharCode(...f.subarray(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...f.subarray(8, 12))).toBe('WEBP')
    // la taille part APRES son propre champ, donc total - 8
    const declaree = f[4]! + f[5]! * 256 + f[6]! * 65536 + f[7]! * 16777216
    expect(declaree).toBe(f.length - 8)
  })

  it('pose VP8X puis ANIM puis une ANMF par image', () => {
    const ids = chunks(webpAnime(images, 64, 64, 50)).map((c) => c.id)
    expect(ids).toEqual(['VP8X', 'ANIM', 'ANMF', 'ANMF', 'ANMF'])
  })

  it('declare l animation ET l alpha dans le VP8X', () => {
    const f = webpAnime(images, 64, 64, 50)
    const vp8x = chunks(f).find((c) => c.id === 'VP8X')!
    const drapeaux = f[vp8x.debut]!
    expect(drapeaux & 0x02).toBe(0x02) // animation
    expect(drapeaux & 0x10).toBe(0x10) // alpha
  })

  it('n annonce pas d alpha quand aucune image n en a', () => {
    const f = webpAnime([faux(), faux()], 64, 64, 50)
    const vp8x = chunks(f).find((c) => c.id === 'VP8X')!
    expect(f[vp8x.debut]! & 0x10).toBe(0)
  })

  /* Les dimensions de la toile sont ecrites en « moins un ». */
  it('ecrit la taille de la toile en moins-un', () => {
    const f = webpAnime(images, 512, 300, 50)
    const vp8x = chunks(f).find((c) => c.id === 'VP8X')!
    const u24 = (o: number) => f[o]! + f[o + 1]! * 256 + f[o + 2]! * 65536
    expect(u24(vp8x.debut + 4)).toBe(511)
    expect(u24(vp8x.debut + 7)).toBe(299)
  })

  /*
   * Sans « ne pas fondre », une image transparente se compose sur la precedente
   * et la boule laisse une trainee fantome derriere elle.
   */
  it('marque chaque image en « ne pas fondre »', () => {
    const f = webpAnime(images, 64, 64, 50)
    for (const c of chunks(f).filter((c) => c.id === 'ANMF')) {
      expect(f[c.debut + 15]! & 0x02).toBe(0x02)
    }
  })

  it('reporte la duree demandee sur chaque image', () => {
    const f = webpAnime(images, 64, 64, 80)
    for (const c of chunks(f).filter((x) => x.id === 'ANMF')) {
      const duree = f[c.debut + 12]! + f[c.debut + 13]! * 256 + f[c.debut + 14]! * 65536
      expect(duree).toBe(80)
    }
  })

  it('boucle sans fin', () => {
    const f = webpAnime(images, 64, 64, 50)
    const anim = chunks(f).find((c) => c.id === 'ANIM')!
    expect(f[anim.debut + 4]! + f[anim.debut + 5]! * 256).toBe(0)
    // fond transparent : rien ne se peint derriere la boule
    expect([f[anim.debut], f[anim.debut + 1], f[anim.debut + 2], f[anim.debut + 3]]).toEqual([0, 0, 0, 0])
  })

  it('refuse une animation vide', () => {
    expect(() => webpAnime([], 64, 64, 50)).toThrow()
  })
})
