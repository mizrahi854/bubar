import { expect, test, type Page } from "@playwright/test";

/** Social layer: stories, comment threads, tag pages, creator insights. Demo session only — not authentication. */
const CUSTOMER = "u-dana";
const OWNER = "u-owner-nova";

async function start(page: Page, userId: string | null, path = "/") {
  await page.addInitScript((id) => {
    if (!localStorage.getItem("beautigo.session")) localStorage.setItem("beautigo.session", JSON.stringify({ userId: id, viewMode: "business", welcomed: true }));
  }, userId);
  await page.goto(`/#${path}`);
}
async function switchRole(page: Page, userId: string | null, path: string) {
  await page.evaluate((id) => localStorage.setItem("beautigo.session", JSON.stringify({ userId: id, viewMode: "business", welcomed: true })), userId);
  await page.goto(`/#${path}`);
  await page.reload();
}

test("business posts a story with text and credit; customer views and replies; owner sees the view", async ({ page }) => {
  await start(page, OWNER, "/create?kind=story");
  await expect(page.getByRole("radio", { name: "סטורי" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "ספריית דמו" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /nails-chrome/ }).click();
  // editor: text sticker
  await page.getByLabel("טקסט חדש").fill("נשארו 2 מקומות");
  await page.getByLabel("טקסט חדש").press("Enter");
  await expect(page.getByRole("button", { name: /טקסט: נשארו 2 מקומות/ })).toBeVisible();
  // credit: bad URL is rejected
  await page.getByText("קרדיט ומקור").click();
  await page.getByLabel("קישור לפוסט / רילס המקורי").fill("http://example.com/x");
  await page.getByRole("button", { name: "העלאה לסטורי" }).click();
  await expect(page.getByText(/קישור מקור: אינסטגרם/).first()).toBeVisible();
  await page.getByLabel("קישור לפוסט / רילס המקורי").fill("https://www.instagram.com/reel/TEST123/");
  await page.getByRole("button", { name: "העלאה לסטורי" }).click();
  await expect(page).toHaveURL(/#\/story\/b-nova/);
  await expect(page.getByRole("dialog", { name: "סטורי של סטודיו נובה" })).toBeVisible();

  await switchRole(page, CUSTOMER, "/story/b-nova");
  const viewer = page.getByRole("dialog", { name: "סטורי של סטודיו נובה" });
  await expect(viewer).toBeVisible();
  // go to the newest (last) story of the business
  for (let i = 0; i < 6; i++) {
    if (await viewer.getByText("נשארו 2 מקומות").isVisible()) break;
    await page.keyboard.press("ArrowLeft");
  }
  await expect(viewer.getByText("נשארו 2 מקומות")).toBeVisible();
  await viewer.getByLabel("תגובה לסטורי").fill("יש מקום מחר בבוקר?");
  await viewer.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText("התגובה נשלחה לסטודיו נובה")).toBeVisible();

  await switchRole(page, OWNER, "/messages");
  await expect(page.getByText(/הגיב\/ה לסטורי: יש מקום מחר בבוקר\?/).first()).toBeVisible();
});

test("comment thread: reply, like, pin by the business", async ({ page }) => {
  await start(page, CUSTOMER, "/b/b-nova");
  await page.getByRole("link", { name: /בלייאז׳ דבש רך/ }).first().click();
  await expect(page).toHaveURL(/#\/post\//);
  const url = page.url().split("#")[1];
  await page.getByRole("button", { name: "תגובות" }).first().click();
  const sheet = page.getByRole("dialog", { name: /תגובות/ });
  await sheet.getByLabel("תגובה", { exact: true }).fill("איזה גוון מהמם #בלייאז׳");
  await sheet.getByRole("button", { name: "שליחת תגובה" }).click();
  const mine = sheet.getByRole("listitem").filter({ hasText: "איזה גוון מהמם" }).first();
  await expect(mine).toBeVisible();
  await mine.getByRole("button", { name: "לייק לתגובה" }).click();
  await expect(mine.getByRole("button", { name: "ביטול לייק לתגובה" })).toBeVisible();

  await switchRole(page, OWNER, url);
  await page.getByRole("button", { name: "תגובות" }).first().click();
  const s2 = page.getByRole("dialog", { name: /תגובות/ });
  const c = s2.getByRole("listitem").filter({ hasText: "איזה גוון מהמם" }).first();
  await c.getByRole("button", { name: "השבה" }).click();
  await expect(s2.getByLabel("תגובה", { exact: true })).toHaveValue(/^@dana\.cohen /);
  await s2.getByLabel("תגובה", { exact: true }).fill("@dana.cohen תודה! מחכות לך");
  await s2.getByRole("button", { name: "שליחת תגובה" }).click();
  await expect(s2.getByText("תודה! מחכות לך")).toBeVisible();
  await c.getByRole("button", { name: "נעיצה" }).click();
  await expect(s2.getByRole("button", { name: "ביטול נעיצה" })).toBeVisible();
});

test("tag page lists matching work and links back to the businesses", async ({ page }) => {
  await start(page, null, `/tag/${encodeURIComponent("בלייאז׳")}`);
  await expect(page.getByRole("heading", { name: "#בלייאז׳", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: /בלייאז׳ דבש רך/ }).first()).toBeVisible();
});

test("creator insights show watch time, retention, sources and stories", async ({ page }) => {
  await start(page, OWNER, "/manage/analytics");
  await expect(page.getByRole("heading", { name: "תובנות יוצרים" })).toBeVisible();
  await expect(page.getByText("זמן צפייה ממוצע")).toBeVisible();
  await expect(page.getByRole("heading", { name: "שימור צופים" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "מאיפה הגיעו הצפיות" })).toBeVisible();
  await expect(page.getByRole("table").last().getByRole("row")).not.toHaveCount(1);
  await expect(page.getByText(/צפיות/).last()).toBeVisible();
});

test("camera explains itself when the browser blocks it", async ({ page }) => {
  await start(page, OWNER, "/create");
  await page.getByRole("button", { name: "צילום" }).click();
  const cam = page.getByRole("dialog", { name: "מצלמה" });
  await expect(cam).toBeVisible();
  await expect(cam.getByText(/מצלמה|גלריה/).first()).toBeVisible();
  await cam.getByRole("button", { name: "סגירת המצלמה" }).click();
  await expect(cam).toHaveCount(0);
});

test("Instagram inspiration: embeds with credit, never presented as Beautigo businesses", async ({ page }) => {
  await start(page, CUSTOMER, "/discover");
  await page.getByRole("link", { name: /השראה מאינסטגרם/ }).click();
  await expect(page).toHaveURL(/#\/inspiration/);
  const frames = page.locator("iframe[src*='instagram.com/reel/']");
  await expect(frames).toHaveCount(20);
  await expect(frames.first()).toHaveAttribute("src", "https://www.instagram.com/reel/DB9RyR9Rmp4/embed/");
  // attributed per the source list vs. unverified
  const zola = page.getByRole("listitem").filter({ hasText: "#11 ·" });
  await expect(zola.getByRole("link", { name: /Zola Ganzorigt/ })).toHaveAttribute("href", "https://www.instagram.com/nailsbyzola/");
  await expect(page.getByRole("listitem").filter({ hasText: "#18 ·" }).getByText("היוצר/ת לא אומת/ה")).toBeVisible();
  await page.getByRole("radio", { name: "ציפורניים" }).click();
  await expect(frames).toHaveCount(6);
  await expect(page.getByRole("link", { name: /@betina_goldstein/ })).toHaveAttribute("href", "https://www.instagram.com/betina_goldstein/");
  // no Beautigo business exists for these creators
  await page.goto("/#/discover");
  await page.getByLabel("חיפוש").fill("Zola");
  await expect(page.getByRole("link", { name: /Zola/ })).toHaveCount(0);
  // "find a business" goes to Discover filtered by the category
  await page.goto("/#/inspiration");
  await page.getByRole("radio", { name: "איפור" }).click();
  await page.getByRole("button", { name: /מצאו עסק לאיפור/ }).first().click();
  await expect(page).toHaveURL(/#\/discover/);
});

test("For you feed mixes in an Instagram card after every 4 reels", async ({ page }) => {
  await start(page, CUSTOMER, "/");
  await expect(page.locator("section[data-index='0']")).toBeVisible();
  const card = page.locator("section[data-index='4']");
  await expect(card).toHaveAttribute("aria-label", /השראה מאינסטגרם/);
  await expect(card.getByRole("link", { name: /פתיחה באינסטגרם/ })).toHaveAttribute("href", "https://www.instagram.com/reel/DB9RyR9Rmp4/");
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator("iframe")).toHaveCount(1);
  await page.screenshot({ path: "test-results/feed-instagram-card.png" });
});
