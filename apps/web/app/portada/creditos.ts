// Créditos de las obras de terceros usadas en el video y en la portada.
// Misma lista que video/portada/CREDITOS.md.

export const CREDITOS: readonly {
  obra: string;
  autor: string;
  licencia: string;
  url: string;
}[] = [
  {
    obra: "Volcán Concepción, isla de Ometepe (foto 03 de la serie)",
    autor: "Ridiculopathy",
    licencia: "CC0",
    url: "https://commons.wikimedia.org/wiki/File:Concepci%C3%B3n_(volcano)._Conceptcion._Ometepe_Island,_Nicaragua_03.jpg",
  },
  {
    obra: "Isla Momotombito y volcán Momotombo, lago de Managua",
    autor: "Pi3.124",
    licencia: "CC BY-SA 4.0",
    url: "https://commons.wikimedia.org/wiki/File:Isla_Momotombito_in_Lake_Managua,_and_Momotombo_Volcano,_with_San_Cristobal_Volcano_in_the_distance.jpg",
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
