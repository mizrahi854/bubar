import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronRight, MessageCircle, Phone, Search, Send } from "lucide-react";
import clsx from "clsx";
import { backend, type Message } from "../backend";
import { useMembership } from "../session";
import { displayPhone } from "../slots";
import { Body, ErrorBox, Loading, PageHead, ago, fmtTime, local, run, useLoad } from "../ui";
import { Avatar, EmptyState, Input } from "../../ui/kit";

/** Message thread used by both the business (purple) and the customer (black & white). */
export function ChatThread({ conversationId, side, businessId, quickReplies = [], brand = side === "business", className }: { conversationId: string; side: "business" | "customer"; businessId: string; quickReplies?: string[]; brand?: boolean; className?: string }) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const markRead = () => void (side === "business" ? backend.markReadByBusiness(conversationId) : backend.markReadByCustomer(conversationId)).catch(() => undefined);

  useEffect(() => {
    let alive = true;
    setMsgs(null);
    backend
      .messages(conversationId)
      .then((m) => alive && setMsgs(m))
      .catch((e) => alive && setError((e as Error).message));
    markRead();
    const off = backend.subscribeConversation(conversationId, (m) => {
      setMsgs((x) => (x && !x.some((y) => y.id === m.id) ? [...x, m] : x));
      if (m.sender !== side) markRead();
    });
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, side]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs?.length]);

  const send = async (body: string) => {
    if (!body.trim()) return;
    setSending(true);
    const ok = await run(() => (side === "business" ? backend.sendAsBusiness(businessId, conversationId, body) : backend.sendAsCustomer(businessId, conversationId, body)));
    setSending(false);
    if (ok) {
      setText("");
      // In Supabase mode the realtime echo adds it; refetch covers a missed event.
      setMsgs(await backend.messages(conversationId));
    }
  };

  // Group by day for small date dividers
  const days = useMemo(() => {
    const out: { day: string; items: Message[] }[] = [];
    for (const m of msgs ?? []) {
      const d = local(m.created_at).toFormat("cccc d בLLLL");
      if (out.at(-1)?.day !== d) out.push({ day: d, items: [] });
      out.at(-1)!.items.push(m);
    }
    return out;
  }, [msgs]);

  return (
    <div className={clsx("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex-1 overflow-y-auto px-1 py-3" aria-live="polite">
        {error && <ErrorBox text={error} />}
        {!msgs && !error && <p className="py-6 text-center text-sm text-muted">טוען הודעות…</p>}
        {msgs && !msgs.length && <p className="py-8 text-center text-sm text-muted">{side === "customer" ? "כתבו לעסק שאלה, בקשה או תמונת השראה (כקישור)." : "עוד אין הודעות. כתבו ללקוח/ה את ההודעה הראשונה."}</p>}
        {days.map((g) => (
          <div key={g.day} className="flex flex-col gap-1.5">
            <div className="my-2 text-center text-[11px] font-semibold text-muted">{g.day}</div>
            {g.items.map((m) => {
              const mine = m.sender === side;
              return (
                <div key={m.id} className={clsx("flex max-w-[82%] flex-col", mine ? "items-start self-start" : "items-end self-end")}>
                  <div className={clsx("whitespace-pre-wrap break-words rounded-[20px] px-3.5 py-2 text-[15px] leading-snug", mine ? (brand ? "bg-brand text-white" : "bg-ink text-ink-inverse") : "bg-surface")}>{m.body}</div>
                  <span className="num mt-0.5 text-[10px] text-muted">{fmtTime(m.created_at)}</span>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={end} />
      </div>
      {quickReplies.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-2">
          {quickReplies.map((q) => (
            <button key={q} type="button" onClick={() => setText(q)} className="h-8 shrink-0 rounded-full border border-line px-3 text-sm hover:bg-surface">
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2 border-t border-line pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="הודעה…" aria-label="הודעה" maxLength={2000} />
        <button type="submit" disabled={!text.trim() || sending} aria-label="שליחה" className={clsx("grid size-12 shrink-0 place-items-center rounded-full text-white disabled:opacity-40", brand ? "bg-brand" : "bg-ink")}>
          <Send className="flip-rtl size-5" />
        </button>
      </form>
    </div>
  );
}

/** Business inbox: list + thread (side by side on desktop). */
export function InboxScreen() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const list = useLoad(() => backend.conversations(businessId!), [businessId], { businessId, tables: ["conversations", "messages"] });
  const rows = (list.data ?? list.stale ?? []).filter((c) => !q.trim() || c.customer_name.includes(q.trim()) || c.customer_phone.includes(q.replace(/\D/g, "").replace(/^0/, "")));
  const current = (list.data ?? list.stale ?? []).find((c) => c.id === id);
  // The thread fills the space between its top and the bottom nav, whatever banners sit above it
  const pane = useRef<HTMLDivElement>(null);
  const [paneH, setPaneH] = useState<number | undefined>();
  useLayoutEffect(() => {
    const fit = () => {
      const el = pane.current;
      if (!el) return;
      const nav = document.querySelector<HTMLElement>("nav.fixed.bottom-0");
      const bottom = nav && getComputedStyle(nav).display !== "none" ? nav.getBoundingClientRect().height : 0;
      setPaneH(Math.max(320, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - bottom));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);
  if (!m) return null;
  return (
    <div className="lg:grid lg:grid-cols-[340px_1fr] lg:gap-0">
      <div className={clsx(id && "hidden lg:block", "lg:border-e lg:border-line")}>
        <PageHead title="הודעות" sub={rows.filter((c) => c.unread).length ? `${rows.filter((c) => c.unread).length} שלא נקראו` : "הכול נקרא"} />
        <Body>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" className="ps-12" placeholder="חיפוש שיחה" aria-label="חיפוש שיחה" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {list.error && <ErrorBox text={list.error} retry={list.reload} />}
          {list.loading && !list.data && !list.stale && <Loading />}
          {list.data && !rows.length && <EmptyState icon={<MessageCircle className="size-6" aria-hidden />} title="אין שיחות" text="לקוחות כותבים לכם מעמוד ההזמנות. אפשר גם לפתוח שיחה מכרטיס הלקוח." />}
          <ul className="flex flex-col">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/biz/messages/${c.id}`} className={clsx("flex items-center gap-3 rounded-2xl p-3 hover:bg-surface", c.id === id && "bg-brand-soft/60")}>
                  <Avatar name={c.customer_name} size={46} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={clsx("truncate", c.unread ? "font-black" : "font-semibold")}>{c.customer_name}</span>
                      <span className="shrink-0 text-[11px] text-muted">{c.last_message ? ago(c.last_message_at) : ""}</span>
                    </span>
                    <span className={clsx("block truncate text-sm", c.unread ? "font-semibold text-ink" : "text-muted")}>
                      {c.last_sender === "business" ? "את/ה: " : ""}
                      {c.last_message || "שיחה חדשה"}
                    </span>
                  </span>
                  {c.unread && <span className="size-2.5 shrink-0 rounded-full bg-brand" aria-label="לא נקרא" />}
                </Link>
              </li>
            ))}
          </ul>
        </Body>
      </div>
      {id ? (
        <div ref={pane} style={{ height: paneH }} className="flex flex-col px-4 lg:px-6">
          <div className="flex items-center gap-2 border-b border-line py-3">
            <button type="button" onClick={() => navigate("/biz/messages")} className="grid size-10 place-items-center rounded-full hover:bg-surface lg:hidden" aria-label="חזרה לשיחות">
              <ChevronRight className="size-6" />
            </button>
            <Avatar name={current?.customer_name ?? ""} size={38} />
            <div className="min-w-0 flex-1">
              {current ? (
                <Link to={`/biz/customers/${current.customer_id}`} className="block truncate font-bold underline-offset-4 hover:underline">
                  {current.customer_name}
                </Link>
              ) : (
                <span className="font-bold">שיחה</span>
              )}
              {current?.customer_phone && (
                <span className="block text-xs text-muted" dir="ltr">
                  {displayPhone(current.customer_phone)}
                </span>
              )}
            </div>
            {current?.customer_phone && (
              <a href={`tel:${current.customer_phone}`} className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand" aria-label="חיוג">
                <Phone className="size-5" />
              </a>
            )}
          </div>
          <ChatThread key={id} conversationId={id} side="business" businessId={m.business.id} quickReplies={m.business.quick_replies} />
        </div>
      ) : (
        <div className="hidden place-items-center text-sm text-muted lg:grid">בחרו שיחה מהרשימה</div>
      )}
    </div>
  );
}

/** Opens (or creates) the conversation with a customer and goes to it. */
export function useOpenChat() {
  const navigate = useNavigate();
  const m = useMembership();
  return async (customerId: string) => {
    let id = "";
    if (await run(async () => (id = await backend.conversationWith(m!.business.id, customerId)))) navigate(`/biz/messages/${id}`);
  };
}

/** Unread conversations count for nav badges (live). */
export function useUnreadCount() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const list = useLoad(() => (businessId ? backend.conversations(businessId) : Promise.resolve([])), [businessId], { businessId, tables: ["conversations", "messages"] });
  return (list.data ?? list.stale ?? []).filter((c) => c.unread).length;
}
