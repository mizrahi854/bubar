# הקמת Beautigo Pro: GitHub, Supabase, Google, Twilio ו־Vercel

המדריך מוביל מאפס ועד מערכת עובדת עם התחברות ב־SMS או Google, מסד נתונים אמיתי וסנכרון אמיתי ל־Google Calendar. זמן משוער: 45–60 דקות.

עד שתגדיר/י את המשתנים, המערכת רצה ב**תצוגה מקדימה**: הכול עובד בדפדפן עם נתוני דוגמה, וקוד ה־SMS הוא תמיד `123456`.

## סדר העבודה

1. GitHub: הקוד כבר שם.
2. Supabase: מסד הנתונים וההתחברות.
3. Google Cloud: התחברות עם Google וגישה ליומן.
4. Twilio: שליחת קודי SMS.
5. Vercel: האתר עצמו והשרת של Google Calendar.
6. חיבור אחרון בין כולם ובדיקה.

לאורך הדרך אוספים ערכים לשמונה משתני סביבה. הרשימה המלאה נמצאת ב־`.env.example`.

---

## 1. GitHub

- הריפו: `mizrahi854/bubar`, ענף `main`.
- Vercel יפרוס אוטומטית כל push ל־`main`. אין צורך בפעולה נוספת.

## 2. Supabase

### יצירת הפרויקט
1. נכנסים ל־https://supabase.com ← **New project**.
2. בוחרים שם, סיסמה למסד הנתונים (שומרים אותה), ו־Region **Frankfurt (eu-central-1)**, הקרוב לישראל.
3. ממתינים כ־2 דקות עד שהפרויקט מוכן.

### הרצת הסכמה
1. בתפריט: **SQL Editor** ← **New query**.
2. מדביקים את כל התוכן של `supabase/migrations/20261004000000_management.sql` ← **Run**.
3. אמורה להופיע ההודעה `Success. No rows returned`.

הסכמה יוצרת את הטבלאות, את חוקי ההרשאה (RLS), את מניעת החפיפות ואת העדכונים החיים.

### שמירת המפתחות
ב־**Project Settings** ← **API** שומרים שלושה ערכים:

| ערך | משתנה סביבה |
|---|---|
| Project URL | `VITE_SUPABASE_URL` וגם `SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` |
| `service_role` key (סודי!) | `SUPABASE_SERVICE_ROLE_KEY` |

> המפתח `service_role` עוקף את כל ההרשאות. הוא נכנס רק ל־Vercel, ולעולם לא לקוד ולא למשתנה שמתחיל ב־`VITE_`.

### כתובות חזרה
**Authentication** ← **URL Configuration**:
- **Site URL**: כתובת האתר ב־Vercel. אם עוד אין כתובת, משלימים אחרי שלב 5.
- **Redirect URLs** ← מוסיפים:
  - `https://YOUR-APP.vercel.app/**`
  - `http://localhost:5173/**`

## 3. Google Cloud: התחברות עם Google וגישה ליומן

לקוח OAuth אחד משמש לשני הדברים.

### פרויקט וממשק היומן
1. נכנסים ל־https://console.cloud.google.com ← יוצרים פרויקט חדש (למשל `beautigo`).
2. **APIs & Services** ← **Library** ← מחפשים **Google Calendar API** ← **Enable**.

### מסך ההסכמה
**APIs & Services** ← **OAuth consent screen** (בממשק החדש: **Google Auth Platform**):
1. User type: **External**.
2. שם האפליקציה, מייל תמיכה, ולוגו (לא חובה).
3. **Scopes** ← מוסיפים:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/calendar.events`
   - `.../auth/calendar.readonly`
4. **Test users**: מוסיפים את המייל שלך ושל כל בעל/ת עסק שיבדוק.

> **חשוב:** כל עוד האפליקציה במצב **Testing**, ההרשאה ליומן פגה אחרי 7 ימים, ואז המערכת תציג "יש לחבר מחדש".
> לשימוש קבוע לוחצים **Publish app**. הרשאות היומן נחשבות "רגישות", ולכן Google תבקש אימות: דף פרטיות, דף תנאים וסרטון קצר. התהליך לוקח כמה ימים עד כמה שבועות.

### יצירת לקוח OAuth
**Credentials** ← **Create credentials** ← **OAuth client ID** ← **Web application**:
- **Authorized JavaScript origins**:
  - `https://YOUR-APP.vercel.app`
  - `http://localhost:5173`
- **Authorized redirect URIs** (שתיים):
  - `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (להתחברות עם Google)
  - `https://YOUR-APP.vercel.app/api/google/callback` (לחיבור היומן)

שומרים את **Client ID** ואת **Client secret** ← אלה `GOOGLE_CLIENT_ID` ו־`GOOGLE_CLIENT_SECRET`.

### הפעלת Google ב־Supabase
**Authentication** ← **Sign In / Providers** ← **Google** ← Enable ← מדביקים Client ID ו־Client secret ← Save.

## 4. Twilio: קודי SMS

1. נרשמים ב־https://www.twilio.com.
   - חשבון ניסיון שולח רק למספרים מאומתים.
   - לשימוש אמיתי צריך להוסיף אמצעי תשלום. כל הודעה לישראל עולה כ־0.05–0.10$.
2. **Verify** ← **Services** ← **Create new**. שם השירות מופיע בהודעה, למשל "Beautigo".
3. שומרים שלושה ערכים:
   - **Account SID** ו־**Auth Token**: בדף הראשי של Twilio.
   - **Verify Service SID**: מתחיל ב־`VA…`.
4. ב־Supabase: **Authentication** ← **Sign In / Providers** ← **Phone** ← Enable ← SMS provider: **Twilio Verify** ← מדביקים את שלושת הערכים ← Save.

> בישראל עדיף לשלוח עם שם שולח (Alphanumeric Sender ID, למשל "Beautigo"). מגדירים אותו ב־Twilio Verify ← Settings.

## 5. Vercel

### ייבוא הפרויקט
1. נכנסים ל־https://vercel.com עם חשבון GitHub ← **Add New…** ← **Project** ← בוחרים `mizrahi854/bubar` ← **Import**.
2. Vercel יזהה את הקובץ `vercel.json`:
   - Framework: Vite
   - Build: `npm run build`
   - Output: `dist`
   - אין צורך לשנות.

### משתני סביבה
לפני **Deploy**, פותחים **Environment Variables** ומוסיפים את כל השמונה:

| משתנה | ערך |
|---|---|
| `VITE_SUPABASE_URL` | Project URL מ־Supabase |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_URL` | Project URL (אותו ערך) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `GOOGLE_CLIENT_ID` | מ־Google Cloud |
| `GOOGLE_CLIENT_SECRET` | מ־Google Cloud |
| `APP_URL` | `https://YOUR-APP.vercel.app` (בלי `/` בסוף) |
| `OAUTH_STATE_SECRET` | מחרוזת אקראית ארוכה |
| `CRON_SECRET` | מחרוזת אקראית ארוכה (שונה מהקודמת) |

- אם עוד לא ידוע מה תהיה הכתובת, מכניסים ערך זמני ל־`APP_URL`. אחרי ה־Deploy מתקנים אותו ב־Settings ← Environment Variables, ועושים **Redeploy**.
- ליצירת מחרוזת אקראית: https://generate-secret.vercel.app/32 או `openssl rand -hex 32`.

### סנכרון יומי
- `vercel.json` מגדיר סנכרון מלא פעם ביום (04:00 UTC), בנוסף לסנכרון המיידי אחרי כל שינוי.
- Vercel שולח את `CRON_SECRET` באופן אוטומטי בכל הרצה.

## 6. חיבור אחרון ובדיקה

1. מעדכנים את הכתובת הסופית של Vercel בשלושה מקומות:
   - ב־Supabase: **Site URL** ו־**Redirect URLs**.
   - ב־Google Cloud: **origins** ו־**redirect URIs**.
   - ב־Vercel: המשתנה `APP_URL`.
2. נכנסים ל־`https://YOUR-APP.vercel.app/#/biz`. הפס הסגול "תצוגה מקדימה" אמור להיעלם.
3. מתחברים עם הטלפון (מגיע SMS) או עם Google ← פותחים עסק.
4. **הגדרות** ← **חיבור ל־Google Calendar** ← מאשרים ב־Google ← בוחרים יומן ← שמירה.
5. פותחים בטלפון אחר את קישור עמוד ההזמנות (`/#/p/השם-שלך`) ומזמינים תור:
   - התור מופיע מיד בפיד הפעילות ובלוח השנה.
   - תוך שניות הוא מופיע גם ב־Google Calendar.
6. מבטלים את התור:
   - הוא נמחק מ־Google Calendar.
   - מי שממתין/ה לשעה כזו ברשימת ההמתנה מסומן/ת "התפנה מקום!".

## מה עלה לאוויר ומה נשאר בחוץ

| רכיב | מצב |
|---|---|
| התחברות ב־SMS או Google | אמיתית (Supabase Auth + Twilio) |
| מסד נתונים, הרשאות ומניעת חפיפות | אמיתי (Postgres + RLS + exclusion constraint) |
| פיד פעילות חי | אמיתי (Supabase Realtime) |
| רשימת המתנה וסימון אוטומטי בביטול | אמיתי (trigger במסד הנתונים) |
| Google Calendar | אמיתי: סנכרון תורים ליומן וחסימת זמנים תפוסים מהיומן |
| הודעה ללקוח/ה כשמתפנה מקום | **לא מחובר**. ההתראה מופיעה אצל העסק, שמתקשר/ת ללקוח/ה |
| תזכורות SMS לפני תור | **לא מחובר** (נבחר לשלב הבא) |
| תשלומים | **לא מחובר** |
| הפיד, הגילוי והרשת החברתית | עדיין דמו מקומי. לא עברו ל־Supabase בסבב הזה |

## בדיקות שאפשר להריץ לבד

```bash
npm test                          # בדיקות יחידה, כולל שרת Google Calendar מול Google מדומה
bash supabase/tests/run.sh        # בדיקות הסכמה על Postgres מקומי (צריך Postgres 15+ מותקן)
npm run test:e2e                  # מסעות בדפדפן (תצוגה מקדימה)
```

## תקלות נפוצות

- **"שליחת SMS לא הוגדרה"**: ספק ה־Phone ב־Supabase לא מוגדר, או ש־Twilio במצב ניסיון והמספר לא מאומת.
- **אחרי התחברות עם Google חוזרים לדף הבית**: חסרה כתובת ה־Vercel ב־**Redirect URLs** של Supabase.
- **`redirect_uri_mismatch` מ־Google**: הכתובת ב־Google Cloud חייבת להיות בדיוק `https://YOUR-APP.vercel.app/api/google/callback`, ו־`APP_URL` חייב להיות זהה לה, בלי `/` בסוף.
- **"Missing environment variables"** בחיבור היומן: אחד המשתנים חסר ב־Vercel. אחרי הוספה צריך **Redeploy**.
- **היומן מתנתק אחרי שבוע**: האפליקציה ב־Google עדיין במצב Testing. ראו שלב 3.
