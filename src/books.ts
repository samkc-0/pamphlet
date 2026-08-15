export type BookSource = {
  author: string;
  id: string;
  title: string;
  url: string;
};

export const BOOKS: BookSource[] = [
  {
    author: "Guadalupe Nettel",
    id: "despues-del-invierno",
    title: "Despues del invierno",
    url: "/books/Despu%C3%A9s%20del%20invierno%20--%20Guadalupe%20Nettel%20--%202014%20--%20ePubLibre%20--%203e106840af7a1558e6537f60bbaa7ddd%20--%20Anna%E2%80%99s%20Archive.epub"
  },
  {
    author: "Gabriel Garcia Marquez",
    id: "del-amor-y-otros-demonios",
    title: "Del amor y otros demonios",
    url: "/books/Del%20amor%20y%20otros%20demonios%20--%20Gabriel%20Garc%C3%ADa%20M%C3%A1rquez%20--%201994%20--%20a2a6be9c757535c5f9e6686e6219394d%20--%20Anna%E2%80%99s%20Archive.epub"
  },
  {
    author: "Isabel Allende",
    id: "la-casa-de-los-espiritus",
    title: "La casa de los espiritus",
    url: "/books/La%20casa%20de%20los%20esp%C3%ADritus%20--%20Isabel%20Allende%20%5BAllende%2C%20Isabel%5D%20--%202011%20--%20Piol%C3%ADn_39%20--%202d29f95203c434220786eb08733d9719%20--%20Anna%E2%80%99s%20Archive%20(1).epub"
  }
];
