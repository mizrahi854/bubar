import type { MediaItem } from "../domain/types";

/**
 * Real reels supplied for the demo (public/reels). Each one keeps its creator credit and a link
 * to the original post; the demo businesses that "post" them are fictional and marked as demo.
 */
type ReelSource = { creator: string; handle: string; seconds: number };

export const REELS: Record<string, ReelSource> = {
  "DB9RyR9Rmp4": { creator: "Atlas Salon", handle: "atlassalondc", seconds: 13 },
  "DIO8lRSRsF6": { creator: "Salon Eva Michelle", handle: "salonem_boston", seconds: 22 },
  "DCegtwzxYLA": { creator: "Atlas Salon", handle: "atlassalondc", seconds: 6 },
  "DHWrLRqsWI-": { creator: "Salon deZEN", handle: "salondezen", seconds: 8 },
  "DIcZCKixkYK": { creator: "Atlas Salon", handle: "atlassalondc", seconds: 17 },
  "DGV680QRjhK": { creator: "Joy Marsh", handle: "capitalluxestudios", seconds: 7 },
  "DGv8s2LRUQD": { creator: "Atlas Salon", handle: "atlassalondc", seconds: 12 },
  "DFQ9-30xlIG": { creator: "Atlas Salon", handle: "atlassalondc", seconds: 18 },
  "DD9-LfGJG34": { creator: "Salon deZEN", handle: "salondezen", seconds: 11 },
  "DDm7Hy4SVei": { creator: "Salon deZEN", handle: "salondezen", seconds: 6 },
  "DF_OXQtT6-3": { creator: "Zola Ganzorigt", handle: "nailsbyzola", seconds: 39 },
  "DIPNY_bBLg0": { creator: "Betina R. Goldstein", handle: "betina_goldstein", seconds: 37 },
  "DI9NDWvxJJp": { creator: "CHANEL BEAUTY Community", handle: "welovecoco", seconds: 22 },
  "Cz8_KUgrCmu": { creator: "Betina R. Goldstein", handle: "betina_goldstein", seconds: 33 },
  "CyoyGEMPMB0": { creator: "Betina R. Goldstein", handle: "betina_goldstein", seconds: 18 },
  "CNnuryXFwYS": { creator: "Betina R. Goldstein", handle: "betina_goldstein", seconds: 30 },
  "ClFSTIstzIA": { creator: "Miss Sunshine", handle: "misssunshine_nails", seconds: 52 },
  "CKjawxAF8OP": { creator: "Betina R. Goldstein", handle: "betina_goldstein", seconds: 30 },
  "Dd4RGV-K2ht": { creator: "Glam By Majha", handle: "glambymajha", seconds: 11 },
  "DL-TXS5xZjW": { creator: "Mary Phillips", handle: "maryphillips", seconds: 61 },
  "CXdyLxbFe4-": { creator: "Beauty Makeup Videos", handle: "elharbeauty", seconds: 45 },
  "CbyeeIyAE0o": { creator: "Kathleen Jennings", handle: "kathleenjenningsbeauty", seconds: 55 },
  "DEKGggpsQ5Y": { creator: "Katie Jane Hughes", handle: "katiejanehughes", seconds: 177 },
  "DN3s3c1WjlN": { creator: "BEAUTY BAY", handle: "beautybay", seconds: 23 },
  "CqkxqnVJhSy": { creator: "Harjot Sarna", handle: "harjotkaursarna", seconds: 48 },
  "C2iNxGBsbe0": { creator: "MachoBarbershop", handle: "macho_barbershop1", seconds: 39 },
  "C39VsJoLeGS": { creator: "Vince Garcia", handle: "vincethebarber", seconds: 11 },
  "C4D3_BwvbGE": { creator: "Vince Garcia", handle: "vincethebarber", seconds: 39 },
  "C4wgcktpJ2y": { creator: "Vince Garcia", handle: "vincethebarber", seconds: 38 },
  "DPuQmE6Emr-": { creator: "Vince Garcia", handle: "vincethebarber", seconds: 17 },
  "DG9dPKRSamt": { creator: "Vince Garcia", handle: "vincethebarber", seconds: 41 },
  "DArnZEfyhmg": { creator: "Vince Garcia", handle: "vincethebarber", seconds: 49 },
  "DUJcoDpjlp4": { creator: "Sean The Barber", handle: "sean_the_barber_", seconds: 39 },
  "DbTDx0fzo_C": { creator: "Andrea Amighetti", handle: "andreaamighetti_", seconds: 67 },
  "DHkCkSGOsm3": { creator: "Ivan Salazar", handle: "ivanthegr8_1", seconds: 73 },
};

export const isReelId = (name: string) => name in REELS;

export function reelMedia(id: string): MediaItem {
  const r = REELS[id];
  return {
    type: "video",
    src: `reels/${id}.mp4`,
    poster: `reels/${id}.jpg`,
    source: `רילס מקורי של ${r.creator} (@${r.handle}) באינסטגרם`,
    creator: `@${r.handle}`,
    sourceReelUrl: `https://www.instagram.com/reel/${id}/`,
    sourceProfileUrl: `https://www.instagram.com/${r.handle}/`,
  };
}

export const reelPoster = (id: string) => `reels/${id}.jpg`;
