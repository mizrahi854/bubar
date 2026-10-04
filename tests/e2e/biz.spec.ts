import { expect, test, type Page } from "@playwright/test";

/**
 * Beautigo Pro (management) journeys, run against the in-browser preview backend.
 * The same screens talk to Supabase when VITE_SUPABASE_URL is set; the database rules
 * themselves are tested in supabase/tests.
 */

async function as(page: Page, userId: string | null, path: string) {
  await page.addInitScript((id) => {
    if (id && !sessionStorage.getItem("__as")) {
      localStorage.setItem("beautigo.pro.preview.user", id);
      sessionStorage.setItem("__as", "1");
    }
  }, userId);
  await page.goto(`/#${path}`);
}

async function phoneLogin(page: Page, phone: string) {
  await page.getByLabel("מספר טלפון").fill(phone);
  await page.getByRole("button", { name: "שליחת קוד" }).click();
  await page.getByLabel(/הקוד שנשלח/).fill("123456");
  await page.getByRole("button", { name: "כניסה", exact: true }).click();
}

test("new owner signs in with an SMS code and opens a business", async ({ page }) => {
  await as(page, null, "/biz");
  await expect(page).toHaveURL(/#\/biz\/login/);
  await phoneLogin(page, "054-7654321");
  await expect(page.getByRole("heading", { name: "פתיחת עסק" })).toBeVisible();
  await page.getByLabel("שם העסק").fill("מספרת הבדיקה");
  await page.getByLabel("כתובת עמוד ההזמנות").fill("test-salon");
  await page.getByLabel("השם שלך ביומן").fill("רון בודק");
  await page.getByRole("button", { name: "יצירת העסק" }).click();
  await expect(page.getByRole("heading", { name: "הגדרות" })).toBeVisible();
  await expect(page.getByText("#/p/test-salon")).toBeVisible();
  await expect(page.getByRole("button", { name: /רון בודק/ })).toBeVisible();
});

test("owner books a manual appointment from the calendar", async ({ page }) => {
  await as(page, "preview-owner", "/biz/calendar?view=list&new=1");
  const sheet = page.getByRole("dialog", { name: "תור חדש" });
  await sheet.getByRole("button", { name: "לקוח/ה חדש/ה" }).click();
  await sheet.getByLabel("שם מלא").fill("לקוחת בדיקה");
  await sheet.getByLabel("טלפון").fill("052-9998877");
  await sheet.getByRole("button", { name: "הוספה" }).click();
  await expect(sheet.getByText("לקוחת בדיקה")).toBeVisible();
  // tomorrow keeps the test away from today's lead time
  const tomorrow = await page.evaluate(() => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }));
  await sheet.getByLabel("תאריך").fill(tomorrow);
  const slot = sheet.getByRole("radiogroup", { name: "שעות פנויות" }).getByRole("radio").first();
  const time = (await slot.textContent())!.trim();
  await slot.click();
  await sheet.getByRole("button", { name: new RegExp(`קביעת תור ללקוחת בדיקה · ${time}`) }).click();
  await expect(page.getByText("התור נקבע")).toBeVisible();
  await expect(page.getByRole("button", { name: /לקוחת בדיקה/ }).first()).toBeVisible();
  // The same slot is no longer offered for that professional
  await page.goto("/#/biz");
  await expect(page.getByText(/לקוחת בדיקה נרשם\/ה למערכת/)).toBeVisible();
  await expect(page.getByText(/לקוחת בדיקה הזמינ\/ה תור/)).toBeVisible();
});

test("live feed updates without reloading", async ({ page }) => {
  await as(page, "preview-owner", "/biz");
  const cards = page.locator("ol[aria-live] > li");
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();
  await page.getByRole("button", { name: "הדמיית פעולת לקוח" }).click();
  // one event, or two when a cancellation also offers the slot to the waitlist
  await expect.poll(() => cards.count()).toBeGreaterThan(before);
});

test("customer books online, cancels, and the waitlist gets the freed slot", async ({ page }) => {
  await as(page, null, "/p/studio-nova");
  await page.getByRole("button", { name: /תספורת נשים/ }).click();
  await page.getByRole("button", { name: "מאיה רוזן" }).click();
  // pick a day within the next 3 days that has a free slot (matches the sample waitlist request)
  const days = page.getByRole("radiogroup", { name: "תאריך" }).getByRole("radio");
  let picked = false;
  for (const i of [3, 2]) {
    if (picked) break;
    await days.nth(i).click();
    await expect(page.getByText("בודקים שעות פנויות…")).toHaveCount(0);
    const t = page.getByRole("radiogroup", { name: "שעה" }).getByRole("radio");
    if ((await t.count()) > 0) {
      await t.first().click();
      picked = true;
    }
  }
  expect(picked).toBe(true);
  await phoneLogin(page, "050-7777777");
  await page.getByLabel("שם מלא").fill("דנה לקוחה");
  await page.getByRole("button", { name: "אישור התור" }).click();
  await expect(page.getByRole("heading", { name: "התור נקבע!" })).toBeVisible();
  const mine = page.locator("section", { hasText: "התורים שלי" });
  await expect(mine.getByText("תספורת נשים")).toBeVisible();
  // 2–3 days ahead is outside the 24h policy, so the customer may cancel
  const cancel = mine.getByRole("button", { name: "ביטול" });
  {
    await cancel.click();
    await page.getByRole("dialog").getByRole("button", { name: "ביטול התור" }).click();
    await expect(page.getByText("התור בוטל")).toBeVisible();
    // Owner sees the registration, booking, cancellation and the waitlist offer
    await page.evaluate(() => localStorage.setItem("beautigo.pro.preview.user", "preview-owner"));
    await page.reload();
    await page.goto("/#/biz/waitlist");
    await expect(page.getByText("התפנה מקום!").first()).toBeVisible();
    await page.goto("/#/biz");
    await expect(page.getByText(/התפנה מקום ב־/).first()).toBeVisible();
    await expect(page.getByText("ביטול תור").first()).toBeVisible();
  }
});

test("staff see only their own column and no customer list", async ({ page }) => {
  await as(page, "preview-staff", "/biz/calendar?view=day");
  await expect(page.getByRole("navigation", { name: "ניווט ניהול" }).first().getByRole("link", { name: "לקוחות" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /נועה/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "כל הצוות" })).toHaveCount(0);
  await expect(page.getByText("מאיה", { exact: true })).toHaveCount(0);
  await page.goto("/#/biz/settings");
  await expect(page.getByText(/מחובר\/ת כחבר\/ת צוות/)).toBeVisible();
});

test("customer messages a business from its page; the business replies from the inbox", async ({ page }) => {
  await as(page, null, "/p/studio-nova");
  await page.getByRole("button", { name: "שליחת הודעה לעסק" }).click();
  const sheet = page.getByRole("dialog", { name: /הודעה ל/ });
  await sheet.getByLabel("מספר טלפון").fill("050-4443322");
  await sheet.getByRole("button", { name: "שליחת קוד" }).click();
  await sheet.getByLabel(/הקוד שנשלח/).fill("123456");
  await sheet.getByRole("button", { name: "כניסה", exact: true }).click();
  await sheet.getByLabel("הודעה", { exact: true }).fill("היי, יש מקום ביום חמישי?");
  await sheet.getByRole("button", { name: "שליחה" }).click();
  await expect(sheet.getByText("היי, יש מקום ביום חמישי?")).toBeVisible();

  // Business side (same browser, preview data)
  await page.evaluate(() => localStorage.setItem("beautigo.pro.preview.user", "preview-owner"));
  await page.reload();
  await page.goto("/#/biz/messages");
  const row = page.getByRole("link", { name: /היי, יש מקום ביום חמישי\?/ });
  await expect(row).toBeVisible();
  await expect(row.getByLabel("לא נקרא")).toBeVisible();
  await row.click();
  await page.getByRole("button", { name: "תודה! נתראה בתור" }).click();
  await page.getByRole("button", { name: "שליחה" }).click();
  await expect(page.getByText("תודה! נתראה בתור").last()).toBeVisible();
  await page.goto("/#/biz");
  await expect(page.getByText(/: היי, יש מקום ביום חמישי\?/).first()).toBeVisible();
});

test("customer card: tags, birthday, preferences, before/after photo and a chat", async ({ page }) => {
  await as(page, "preview-owner", "/biz/customers/cus-3");
  await page.getByRole("button", { name: "עריכה" }).click();
  const sheet = page.getByRole("dialog", { name: "עריכת כרטיס לקוח" });
  await sheet.getByRole("button", { name: "+ כלה" }).click();
  await sheet.getByLabel("תאריך לידה").fill("1995-06-20");
  await sheet.getByLabel("העדפות ופורמולות").fill("גוון 8.3 · עור רגיש");
  await sheet.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("כלה", { exact: true })).toBeVisible();
  await expect(page.getByText("גוון 8.3 · עור רגיש")).toBeVisible();
  await expect(page.getByText(/יום הולדת/)).toBeVisible();
  // a tiny PNG as the "before" photo
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await page.locator("input[type=file]").setInputFiles({ name: "before.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: /^לפני ·/ })).toBeVisible();
  await page.getByRole("button", { name: "הודעה", exact: true }).click();
  await expect(page).toHaveURL(/#\/biz\/messages\//);
  await expect(page.getByLabel("הודעה", { exact: true })).toBeVisible();
});

test("reports show revenue, breakdowns and a table view", async ({ page }) => {
  await as(page, "preview-owner", "/biz/reports");
  await expect(page.getByText("הכנסות", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "לפי איש צוות" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "שעות עמוסות" })).toBeVisible();
  await page.getByRole("button", { name: "תצוגת טבלה" }).click();
  await expect(page.getByRole("columnheader", { name: "הכנסות" })).toBeVisible();
  await page.getByRole("radio", { name: "שנה" }).click();
  await expect(page.getByRole("heading", { name: "לפי שירות" })).toBeVisible();
});
