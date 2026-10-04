import { Link } from "react-router";
import { BarChart3, CalendarCheck2, CalendarDays, Clock3, ExternalLink, Lightbulb, MessageCircle, ShieldCheck, Smartphone, Sparkles, UserRound, Users } from "lucide-react";
import { useMembership } from "../session";
import { Body, PageHead } from "../ui";

type Feature = { icon: typeof Sparkles; title: string; text: string; to: string; tryIt: string; owner?: boolean };

const FEATURES: Feature[] = [
  { icon: Sparkles, title: "פיד פעילות חי", text: "רישום לקוחות, הזמנות, ביטולים, הודעות ורשימת המתנה מופיעים בזמן אמת, בלי לרענן.", to: "/biz", tryIt: "לחצו ״הדמיית פעולת לקוח״ בראש המסך" },
  { icon: CalendarDays, title: "יומן", text: "רשימה, יום, שבוע וחודש. צבע לכל איש צוות, תור חדש בכפתור +, שינוי מועד, ביטול, אישור וחסימת זמן. המערכת לא מאפשרת חפיפה.", to: "/biz/calendar", tryIt: "לחצו על תור כדי לראות את כל הפעולות" },
  { icon: MessageCircle, title: "הודעות", text: "לקוחות כותבים מעמוד ההזמנות או מתוך תור קיים. עונים מכאן, עם תשובות מהירות, וההודעות מגיעות בזמן אמת.", to: "/biz/messages", tryIt: "פתחו שיחה וענו בתשובה מהירה" },
  { icon: Users, title: "כרטיס לקוח", text: "היסטוריה, סה״כ ומחיר ממוצע, תגיות (VIP, צבע קבוע), יום הולדת, העדפות ופורמולות, ותמונות לפני ואחרי שנשמרות פרטיות לעסק.", to: "/biz/customers", tryIt: "פתחו לקוחה והוסיפו תמונת ״לפני״", owner: true },
  { icon: Clock3, title: "רשימת המתנה", text: "כשתור מתבטל, מי שממתין/ה לאותו שירות, יום ושעה מסומן/ת אוטומטית ״התפנה מקום!״.", to: "/biz/waitlist", tryIt: "בטלו תור ביומן וחזרו לכאן" },
  { icon: BarChart3, title: "דוחות והכנסות", text: "הכנסות לאורך זמן, צפי ל־30 יום, ממוצע לתור, לקוחות חוזרים, אי־הגעה, פילוח לפי צוות ושירות, ומפת שעות עמוסות.", to: "/biz/reports", tryIt: "החליפו תקופה: שבוע, חודש, שנה", owner: true },
  { icon: CalendarCheck2, title: "Google Calendar", text: "כל תור נכנס ליומן Google שלך, ביטול נמחק, וזמנים תפוסים ביומן נחסמים כאן. מתעדכן מיד ובנוסף פעם ביום.", to: "/biz/settings", tryIt: "הגדרות ← חיבור ל־Google Calendar", owner: true },
  { icon: Smartphone, title: "עמוד הזמנות ללקוחות", text: "קישור אישי לביו של אינסטגרם: בחירת שירות, איש צוות ושעה, כניסה ב־SMS או Google, ביטול עצמאי, הודעות ורשימת המתנה.", to: "/biz/settings", tryIt: "הגדרות ← ״פתיחה״ ליד הקישור" },
  { icon: UserRound, title: "צוות והרשאות", text: "מזמינים עובד/ת לפי טלפון. הוא/היא רואים רק את העמודה שלהם ביומן, בלי מחירים ובלי רשימת לקוחות.", to: "/biz/settings", tryIt: "הגדרות ← צוות ושעות", owner: true },
  { icon: ShieldCheck, title: "אבטחה", text: "כל עסק רואה רק את הנתונים שלו (Row Level Security). טוקני Google נשמרים בשרת בלבד. מניעת חפיפה נאכפת במסד הנתונים.", to: "/biz/tour", tryIt: "נבדק ב־47 בדיקות על Postgres אמיתי" },
];

const NEXT = [
  "תזכורות SMS/WhatsApp אוטומטיות יום לפני התור (דורש Twilio או WhatsApp Business)",
  "הודעה אוטומטית ללקוח/ה מרשימת ההמתנה כשמתפנה מקום, עם כפתור ״לקבוע״",
  "מקדמה ותשלום אונליין (Grow/Meshulam, Cardcom, Stripe)",
  "ברכת יום הולדת עם הטבה, ושליחה לקבוצת לקוחות לפי תגית",
  "חבילות וכרטיסיות (למשל 5 טיפולים במחיר מיוחד)",
  "מכירת מוצרים ומלאי בסיסי",
  "ביקורות אחרי תור, שמופיעות בעמוד ההזמנות",
];

export function TourScreen() {
  const m = useMembership();
  const owner = m?.role === "owner";
  return (
    <>
      <PageHead title="כל היכולות" sub="סיור קצר: לכל יכולת יש קישור ישיר ומה כדאי לנסות." />
      <Body className="pb-10">
        <ul className="grid gap-3 md:grid-cols-2">
          {FEATURES.filter((f) => !f.owner || owner).map((f) => (
            <li key={f.title}>
              <Link to={f.to} className="flex h-full gap-3 rounded-[24px] border border-line p-4 transition hover:border-brand/40 hover:bg-brand-soft/30">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{f.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-muted">{f.text}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                    נסו: {f.tryIt} <ExternalLink className="size-3" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <section className="mt-8 rounded-[24px] bg-[#0d0b1a] p-5 text-white">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Lightbulb className="size-5 text-brand-2" aria-hidden /> מה אפשר להוסיף בהמשך
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-white/85">
            {NEXT.map((x) => (
              <li key={x} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-2" aria-hidden /> {x}
              </li>
            ))}
          </ul>
        </section>
      </Body>
    </>
  );
}
