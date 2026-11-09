// Créditos de las obras de terceros usadas en el video y en la portada.
// Misma lista que video/portada/CREDITOS.md.

/** Aviso de cambios que piden las licencias CC BY y CC BY-SA; va junto a los créditos. */
export const CAMBIOS_FOTOS =
  "Fotos redimensionadas y recortadas para encajar en las celdas del panal; a la del Momotombo se le quitó el borde del escaneo.";

export const CREDITOS: readonly {
  obra: string;
  autor: string;
  licencia: string;
  url: string;
}[] = [
  {
    obra: "Volcán Concepción, isla de Ometepe",
    autor: "Ridiculopathy",
    licencia: "CC0",
    url: "https://commons.wikimedia.org/wiki/File:Concepci%C3%B3n_(volcano)._Conceptcion._Ometepe_Island,_Nicaragua_03.jpg",
  },
  {
    obra: "Volcán Momotombo desde el lago de Managua",
    autor: "Diego Tirira",
    licencia: "CC BY-SA 2.0",
    url: "https://commons.wikimedia.org/wiki/File:NI_Lago_Managua_0411_013_(17258681665).jpg",
  },
  {
    obra: "Guardabarranco (Eumomota superciliosa)",
    autor: "Bernard Gagnon",
    licencia: "CC0",
    url: "https://commons.wikimedia.org/wiki/File:Turquoise-browed_motmot_in_Costa_Rica_01.jpg",
  },
  {
    obra: "Catedral de Granada, Nicaragua",
    autor: "ruben i",
    licencia: "CC BY 2.0",
    url: "https://commons.wikimedia.org/wiki/File:Catedral_de_Granada,_Nicaragua_2.jpg",
  },
  {
    obra: "Güegüense o Macho Ratón",
    autor: "SeleneYang",
    licencia: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:G%C3%BCeguense_o_Macho_Rat%C3%B3n.jpg",
  },
  {
    obra: "Flor de Plumeria alba (sacuanjoche)",
    autor: "Lakshmipriya Pugal",
    licencia: "CC0",
    url: "https://commons.wikimedia.org/wiki/File:Plumeria_alba_flower.jpg",
  },
  {
    obra: "Música «Calm Blue Lake» (recortada a 40 s)",
    autor: "Jason Shaw (audionautix.com)",
    licencia: "CC BY 3.0",
    url: "https://commons.wikimedia.org/wiki/File:Audionautix-com-ccby-calmbluelake.mp3",
  },
  {
    obra: "Imagen de Renacer (portada y video)",
    autor: "Renacer",
    licencia: "imagen ilustrativa creada con IA",
    url: "/renacer.jpg",
  },
] as const;
