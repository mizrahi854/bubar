import { expect, test, type Page } from "@playwright/test";

/**
 * The 12 required demo journeys (spec §19). Each test starts from the seed dataset
 * in a fresh browser context. Role switching here uses the demo session — not authentication.
 */

const CUSTOMER = "u-dana";
const OWNER = "u-owner-nova";
const ADMIN = "u-admin";

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

const slotGroups = (page: Page) => page.getByRole("radiogroup", { name: /^שעות/ });

/** Calendar step: closes the service note if shown, then opens the n-th bookable day. */
async function pickDay(page: Page, n = 1) {
  await expect(page.getByRole("heading", { name: "בחירת תאריך" })).toBeVisible();
  const note = page.getByRole("button", { name: "סגירת ההודעה" });
  if (await note.isVisible()) await note.click();
  const day = page.getByRole("radiogroup", { name: "תאריך" }).locator("[role=radio]:not([disabled])").nth(n);
  const label = await day.getAttribute("aria-label");
  await day.click();
  await expect(page.getByRole("heading", { name: "בחירת שעה" })).toBeVisible();
  return label;
}

/** Calendar → time list → picks the n-th slot, which opens the confirmation sheet. Returns the time text. */
async function pickSlotAndContinue(page: Page, n = 0) {
  await pickDay(page);
  const slot = slotGroups(page).getByRole("radio").nth(n);
  const time = (await slot.textContent())!.trim();
  await slot.click();
  await expect(confirmSheet(page)).toBeVisible();
  return time;
}

const confirmSheet = (page: Page) => page.getByRole("dialog", { name: "אישור התור שבחרת" });
const confirmBooking = (page: Page) => confirmSheet(page).getByRole("button", { name: /^(אישור|שליחת בקשה)/ });

/** Books "פן ועיצוב" (auto-approved, pay at business) with נועה at Studio Nova; returns appointment id and time. */
async function bookBlowdry(page: Page) {
  await page.goto("/#/book/b-nova?service=b-nova-s1&pro=b-nova-p2");
  // a day a few days ahead, so the customer may still change or cancel under the policy
  await pickDay(page, 3);
  const slot = slotGroups(page).getByRole("radio").first();
  const time = (await slot.textContent())!.trim();
  await slot.click();
  await confirmBooking(page).click();
  await expect(page.getByRole("heading", { name: /התור הוזמן בהצלחה/ })).toBeVisible();
  await page.getByRole("link", { name: "לפרטי התור" }).click();
  await expect(page).toHaveURL(/#\/appointments\/apt/);
  await expect(page.getByRole("heading", { name: "פרטי תור" })).toBeVisible();
  const id = page.url().split("/appointments/")[1];
  return { id, time };
}

test("1. guest opens a reel, signs in and completes a booking without losing context", async ({ page }) => {
  await start(page, null, "/");
  const first = page.locator("section[data-index='0']");
  await expect(first).toBeVisible();
  await first.getByRole("button", { name: "קביעת תור" }).click();
  await expect(page).toHaveURL(/#\/book\//);
  // Staff first ("find me the fastest"), then the treatment unless the post preselected it
  if (await page.getByRole("heading", { name: "בחירת איש צוות" }).isVisible()) await page.getByRole("button", { name: /תמצא לי תור מהיר/ }).click();
  if (await page.getByRole("heading", { name: "בחירת טיפול" }).isVisible()) await page.getByRole("list", { name: "טיפולים" }).getByRole("button").first().click();
  const time = await pickSlotAndContinue(page);
  const summary = await confirmSheet(page).innerText();
  expect(summary).toContain(time);
  await confirmBooking(page).click();
  // Guest is asked to sign in; choices are kept
  await page.getByRole("link", { name: "התחברות או הרשמה" }).click();
  await expect(page.getByText("ההזמנה שלך שמורה")).toBeVisible();
  await page.getByRole("button", { name: /דנה כהן/ }).click();
  await expect(page).toHaveURL(/#\/book\//);
  await expect(confirmSheet(page)).toBeVisible();
  expect(await confirmSheet(page).innerText()).toBe(summary);
  await confirmBooking(page).click();
  await expect(page.getByRole("heading", { name: /התור הוזמן בהצלחה|הבקשה נשלחה|נשאר רק לשלם מקדמה/ })).toBeVisible();
});

test("2. selected city filters both business results and reels", async ({ page }) => {
  await start(page, CUSTOMER, "/discover");
  await page.getByRole("button", { name: /כל הארץ/ }).click();
  await page.getByRole("dialog").getByRole("option", { name: "חיפה" }).click();
  await expect(page.getByText(/עסקים בחיפה/)).toBeVisible();
  const names = await page.locator("main a[href^='#/b/'] .font-bold").allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(["בראו ביוטי", "הספר של הכרמל"]).toContain(n.trim());
  // Reels: "קרוב אליי" uses the selected city
  await page.goto("/#/");
  await page.getByRole("button", { name: "קרוב אליי" }).click();
  await page.getByRole("button", { name: /תל אביב-יפו|בחירת עיר/ }).click();
  await page.getByRole("dialog").getByRole("option", { name: "חיפה" }).click();
  const labels = await page.locator("section[data-index]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(/בראו ביוטי|הספר של הכרמל/.test(l)).toBe(true);
});

test("3. selected professional changes services and available slots", async ({ page }) => {
  await start(page, CUSTOMER, "/pro/b-nova-p1");
  const danielServices = await page.locator("section", { hasText: "שירותים" }).locator(".font-bold").allInnerTexts();
  await page.goto("/#/pro/b-nova-p2");
  const noaServices = await page.locator("section", { hasText: "שירותים" }).locator(".font-bold").allInnerTexts();
  expect(danielServices).not.toEqual(noaServices);
  // Root colour is only offered by Daniel
  await page.goto("/#/book/b-nova?service=b-nova-s2");
  await expect(page.getByRole("heading", { name: "בחירת איש צוות" })).toBeVisible();
  await expect(page.getByRole("button", { name: /דניאל כהן/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /נועה לוי/ })).toHaveCount(0);
  // Balayage: Maya vs Daniel have different hours → different slots on the same day
  const slotsFor = async (pro: string) => {
    await page.goto(`/#/book/b-nova?service=b-nova-s3&pro=${pro}`);
    // the 4th enabled day so both have a comparable, fully future day
    const day = await pickDay(page, 3);
    return { day, slots: await slotGroups(page).getByRole("radio").allInnerTexts() };
  };
  const maya = await slotsFor("b-nova-p0");
  const daniel = await slotsFor("b-nova-p1");
  expect(maya.slots.join()).not.toEqual(daniel.slots.join());
});

test("4+5. booking appears for customer and business; rescheduling updates both views", async ({ page }) => {
  await start(page, CUSTOMER, "/");
  const { id, time } = await bookBlowdry(page);
  await expect(page.getByText(time).first()).toBeVisible();
  await page.goto("/#/appointments");
  await expect(page.getByRole("link", { name: /פן ועיצוב/ }).first()).toBeVisible();

  await switchRole(page, OWNER, `/manage/appointments/${id}`);
  await expect(page.getByRole("heading", { name: "דנה כהן" })).toBeVisible();
  await expect(page.getByText(time).first()).toBeVisible();
  // Business calendar (week view; move forward until the appointment's week is shown)
  await page.goto("/#/manage/calendar");
  await page.getByRole("radio", { name: "שבוע" }).click();
  const inCalendar = page.locator(`a[href='#/manage/appointments/${id}']`);
  for (let i = 0; i < 3 && (await inCalendar.count()) === 0; i++) await page.getByRole("button", { name: "הבא" }).click();
  await expect(inCalendar.first()).toBeAttached();

  // Customer reschedules
  await switchRole(page, CUSTOMER, `/appointments/${id}`);
  await page.getByRole("button", { name: "שינוי מועד" }).click();
  const dialog = page.getByRole("dialog");
  const options = dialog.getByRole("radiogroup", { name: /^שעות/ }).getByRole("radio");
  let newTime = "";
  for (let i = 0; i < (await options.count()); i++) {
    const t = (await options.nth(i).innerText()).trim();
    if (t !== time) {
      newTime = t;
      await options.nth(i).click();
      break;
    }
  }
  expect(newTime).not.toBe("");
  await dialog.getByRole("button", { name: "המשך" }).click();
  await page.getByRole("button", { name: "אישור השינוי" }).click();
  await expect(page.getByText("המועד עודכן")).toBeVisible();
  await expect(page.getByText(newTime).first()).toBeVisible();

  await switchRole(page, OWNER, `/manage/appointments/${id}`);
  await expect(page.getByText(newTime).first()).toBeVisible();
});

test("6. cancellation releases the slot", async ({ page }) => {
  await start(page, CUSTOMER, "/");
  const { id, time } = await bookBlowdry(page);
  const openSameDay = async () => {
    await page.goto("/#/book/b-nova?service=b-nova-s1&pro=b-nova-p2");
    await pickDay(page, 3);
  };
  // While booked, that time is not offered
  await openSameDay();
  await expect(slotGroups(page).getByRole("radio", { name: time, exact: true })).toHaveCount(0);
  await page.goto(`/#/appointments/${id}`);
  await page.getByRole("button", { name: "ביטול התור" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ביטול התור" }).click();
  await expect(page.getByText("התור בוטל והמועד שוחרר")).toBeVisible();
  await openSameDay();
  await expect(slotGroups(page).getByRole("radio", { name: time, exact: true })).toHaveCount(1);
});

test("7. customer cannot publish a post or reel", async ({ page }) => {
  await start(page, CUSTOMER, "/create");
  await expect(page.getByRole("heading", { name: "המסך הזה לא זמין בחשבון הנוכחי" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "ניווט ראשי" }).getByRole("link", { name: "יצירה" })).toHaveCount(0);
});

test("8. business publishes content that appears in its profile and feed", async ({ page }) => {
  await start(page, OWNER, "/create");
  await page.getByRole("button", { name: "ספריית דמו" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /hair-ash/ }).click();
  await page.getByLabel("כיתוב").fill("בדיקת פרסום — גוון אפר קר");
  await page.getByLabel("תגיות").fill("בדיקתפרסום אפר");
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page).toHaveURL(/#\/post\//);
  await page.goto("/#/b/b-nova");
  await expect(page.getByRole("link", { name: "בדיקת פרסום — גוון אפר קר" })).toBeVisible();
  // Public: a guest finds it through the tag
  await switchRole(page, null, "/discover?tag=בדיקתפרסום");
  await expect(page.getByRole("link", { name: "בדיקת פרסום — גוון אפר קר" })).toBeVisible();
  // And in the feed
  await page.goto("/#/");
  await expect(page.locator("section[data-index]", { hasText: "בדיקת פרסום — גוון אפר קר" })).toHaveCount(1);
});

test("9. review submission requires a completed appointment", async ({ page }) => {
  await start(page, CUSTOMER, "/appointments");
  // An upcoming appointment offers no review
  await page.getByRole("link", { name: /סטודיו נובה/ }).first().click();
  await expect(page.getByRole("link", { name: "כתיבת ביקורת" })).toHaveCount(0);
  const upcomingId = page.url().split("/appointments/")[1];
  await page.goto(`/#/review/${upcomingId}`);
  await expect(page.getByRole("heading", { name: "אי אפשר לכתוב ביקורת על התור הזה" })).toBeVisible();
  // The completed one can be reviewed once
  await page.goto("/#/appointments");
  await page.getByRole("radio", { name: /היסטוריה/ }).click();
  await page.getByRole("link", { name: /אפשר לכתוב ביקורת/ }).first().click();
  const completedId = page.url().split("/appointments/")[1];
  await page.getByRole("link", { name: "כתיבת ביקורת" }).click();
  await page.getByRole("radio", { name: /5 כוכבים/ }).click();
  await page.getByLabel(/ספרו עוד/).fill("חוויה מעולה, בדיקה אוטומטית");
  await page.getByRole("button", { name: "פרסום ביקורת" }).click();
  await expect(page.getByText("חוויה מעולה, בדיקה אוטומטית")).toBeVisible();
  // A second review for the same appointment is refused
  await page.goto(`/#/review/${completedId}`);
  await expect(page.getByRole("heading", { name: "אי אפשר לכתוב ביקורת על התור הזה" })).toBeVisible();
});

test("10. administrator moderation changes public visibility", async ({ page }) => {
  await start(page, ADMIN, "/admin/moderation");
  const row = page.locator("section", { hasText: "פרסומים אחרונים" }).locator("li").first();
  const href = (await row.getByRole("link").getAttribute("href"))!;
  await row.getByRole("button", { name: "הסתרה" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "הסתרה" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible(); // reason is required
  await dialog.getByRole("textbox").fill("הפרת זכויות יוצרים — בדיקה");
  await dialog.getByRole("button", { name: "הסתרה" }).click();
  await expect(page.getByText("בוצע ונרשם ביומן הפעולות")).toBeVisible();
  await page.goto("/#/admin/audit");
  await expect(page.getByText("הפרת זכויות יוצרים — בדיקה")).toBeVisible();
  await switchRole(page, null, href.replace(/^#/, ""));
  await expect(page.getByRole("heading", { name: "התוכן לא זמין" })).toBeVisible();
});

test("11+12. settings persist and affect appearance; refresh preserves demo state", async ({ page }) => {
  await start(page, CUSTOMER, "/settings");
  await page.getByRole("radio", { name: "כהה" }).click();
  await page.getByRole("switch", { name: "הפחתת שקיפות" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-transparency", "reduce");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // Follow a business, then refresh
  await page.goto("/#/b/b-blade");
  await page.getByRole("button", { name: "מעקב", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "במעקב" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
  expect(bg).not.toBe("rgb(255, 255, 255)");
});

test.describe("additional states", () => {
  test("deposit: failed simulated payment keeps the hold, then success confirms", async ({ page }) => {
    await start(page, CUSTOMER, "/book/b-nova?service=b-nova-s2");
    await page.getByRole("button", { name: /דניאל כהן/ }).click();
    await pickSlotAndContinue(page);
    await expect(confirmSheet(page).getByText(/מקדמה .* עכשיו \(דמו\), היתרה בעסק/)).toBeVisible();
    await confirmBooking(page).click();
    const sheet = page.getByRole("dialog", { name: "תשלום מקדמה" });
    await expect(sheet.getByText("לא נאספים פרטי כרטיס")).toBeVisible();
    await expect(sheet.locator("input")).toHaveCount(0); // never asks for card details
    await sheet.getByRole("button", { name: "סימולציית כשל בתשלום" }).click();
    await expect(sheet.getByRole("alert")).toContainText("נכשל");
    await sheet.getByRole("button", { name: "אישור תשלום (דמו)" }).click();
    await expect(sheet).toHaveCount(0);
    await page.getByRole("link", { name: "לפרטי התור" }).click();
    await expect(page.getByText("מאושר").first()).toBeVisible();
  });

  test("manual approval: request is pending until the business approves", async ({ page }) => {
    await start(page, CUSTOMER, "/book/b-chrome?service=b-chrome-s1");
    if (await page.getByRole("heading", { name: "בחירת איש צוות" }).isVisible()) await page.getByRole("button", { name: /תמצא לי תור מהיר/ }).click();
    await pickSlotAndContinue(page);
    await confirmSheet(page).getByRole("button", { name: "שליחת בקשה" }).click();
    await expect(page.getByRole("heading", { name: /הבקשה נשלחה/ })).toBeVisible();
    await page.getByRole("link", { name: "לפרטי התור" }).click();
    await expect(page.getByText("ממתין לאישור העסק").first()).toBeVisible();
  });

  test("google calendar simulation: connect, failing sync, disconnect", async ({ page }) => {
    await start(page, OWNER, "/manage/settings");
    const card = page.locator("section", { hasText: "Google Calendar" }).first();
    await expect(card.getByText("סימולציה — אין חיבור אמיתי")).toBeVisible();
    await card.getByRole("switch", { name: /סימולציית כשל/ }).click();
    await card.getByRole("button", { name: "סנכרון עכשיו" }).click();
    await expect(card.getByRole("alert")).toContainText("invalid_grant");
    await card.getByRole("button", { name: "ניתוק" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ניתוק" }).click();
    await expect(card.getByRole("button", { name: "חיבור (סימולציה)" })).toBeVisible();
    await card.getByRole("button", { name: "חיבור (סימולציה)" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "חיבור היומן" }).click();
    await expect(card.getByText("מחובר (סימולציה)")).toBeVisible();
  });

  test("messages: customer writes, business sees it as unread", async ({ page }) => {
    await start(page, CUSTOMER, "/b/b-blade");
    await page.getByRole("button", { name: "הודעה" }).click();
    await page.getByLabel("הודעה", { exact: true }).fill("היי, יש תור לפייד מחר?");
    await page.getByRole("button", { name: "שליחה" }).click();
    await expect(page.getByText("היי, יש תור לפייד מחר?")).toBeVisible();
    await switchRole(page, "u-owner-blade", "/messages");
    await expect(page.getByLabel("לא נקרא").first()).toBeVisible();
    await page.getByRole("link", { name: /דנה כהן/ }).click();
    await expect(page.getByText("היי, יש תור לפייד מחר?")).toBeVisible();
  });
});
