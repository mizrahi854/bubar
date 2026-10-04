import type { CategoryId } from "../domain/types";

/**
 * Instagram reels supplied by the account owner as public source references (4.10.2026).
 * Shown only through Instagram's official embed, which loads in the viewer's browser —
 * no media is downloaded or re-hosted. The embed itself shows the real publishing account.
 *
 * `creator` is the attribution given in the source list. It has NOT been verified against the
 * publishing account by Beautigo; records without one are left unattributed on purpose.
 * None of these creators participate in Beautigo.
 */
export type Attribution = "per_source" | "unverified";

export interface InspirationReel {
  id: string;
  /** Row number in the source list */
  n: number;
  category: Extract<CategoryId, "hair" | "nails" | "makeup">;
  topic: string;
  sourceReelUrl: string;
  sourceProfileUrl?: string;
  creator?: string;
  attribution: Attribution;
}

export interface SourceProfile {
  handle: string;
  sourceProfileUrl: string;
  field: string;
  creator?: string;
}

const ig = (path: string) => `https://www.instagram.com/${path}/`;

const R = (n: number, category: InspirationReel["category"], topic: string, code: string, profile?: string, creator?: string): InspirationReel => ({
  id: `ig-${String(n).padStart(2, "0")}`,
  n,
  category,
  topic,
  sourceReelUrl: ig(`reel/${code}`),
  sourceProfileUrl: profile ? ig(profile) : undefined,
  creator,
  attribution: creator ? "per_source" : "unverified",
});

export const INSPIRATION_REELS: InspirationReel[] = [
  R(1, "hair", "לפני ואחרי טיפול שיער", "DB9RyR9Rmp4"),
  R(2, "hair", "סיור במספרה", "DIO8lRSRsF6"),
  R(3, "hair", "אווירה וצילום המספרה", "DCegtwzxYLA"),
  R(4, "hair", "תוכן סביב קביעת תור", "DHWrLRqsWI-"),
  R(5, "hair", "אנשי מקצוע והבדלים באורך תספורת", "DIcZCKixkYK"),
  R(6, "hair", "חוויית טיפול בשיער", "DGV680QRjhK"),
  R(7, "hair", "היכרות עם צוות המספרה", "DGv8s2LRUQD"),
  R(8, "hair", "סגנונות שיער", "DFQ9-30xlIG"),
  R(9, "hair", "המלצות מוצרים מאנשי המקצוע", "DD9-LfGJG34"),
  R(10, "hair", "תוצאה מול בקשת הלקוחה", "DDm7Hy4SVei"),
  R(11, "nails", "ציפורניים", "DF_OXQtT6-3", "nailsbyzola", "Zola Ganzorigt"),
  R(12, "nails", "ציפורניים", "DIPNY_bBLg0", "betina_goldstein", "Betina Goldstein"),
  R(13, "nails", "ציפורניים", "DI9NDWvxJJp", "betina_goldstein", "Betina Goldstein"),
  R(14, "nails", "נייל ארט", "Cz8_KUgrCmu"),
  R(15, "nails", "נייל ארט", "CyoyGEMPMB0"),
  R(16, "nails", "ציפורניים", "C8cdXp1pd5V", "junchi.create.la", "Junchi"),
  R(17, "makeup", "איפור", "Dd4RGV-K2ht", "glambymajha", "Glam By Majha"),
  // #18: source mentions Mary Phillips, but the publishing account was not checked — left unattributed
  R(18, "makeup", "תוכן ביוטי", "DL-TXS5xZjW"),
  R(19, "makeup", "השראת איפור", "CXdyLxbFe4-"),
  R(20, "makeup", "הדרכת איפור בסגנון Bratz", "CRB8o-VDN7i"),
];

export const SOURCE_PROFILES: SourceProfile[] = [
  { handle: "nailsbyzola", field: "ציפורניים", creator: "Zola Ganzorigt" },
  { handle: "betina_goldstein", field: "ציפורניים", creator: "Betina Goldstein" },
  { handle: "junchi.create.la", field: "ציפורניים", creator: "Junchi" },
  { handle: "ryo_kitamura", field: "ציפורניים" },
  { handle: "studio__neptune", field: "סטודיו לציפורניים" },
  { handle: "glambymajha", field: "איפור", creator: "Glam By Majha" },
  { handle: "makeupby.ritaantoine", field: "איפור" },
  { handle: "glambyfares", field: "איפור" },
  { handle: "reyezblendzzz", field: "ברבר ותספורות" },
  { handle: "principealeff", field: "ברבר ועיצובי תספורת" },
  { handle: "juliodiddahcut", field: "עבודות ברבר" },
].map((p) => ({ ...p, sourceProfileUrl: ig(p.handle) }));

/** Official embed URL for a reel/post page URL. */
export const embedUrl = (reelUrl: string) => `${reelUrl.replace(/\/?$/, "/")}embed/`;

export const CATEGORY_LABEL: Record<InspirationReel["category"], string> = { hair: "שיער ומספרות", nails: "ציפורניים", makeup: "איפור וביוטי" };
