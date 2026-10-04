import { useEffect, useRef, useState } from "react";

/**
 * Desktop presentation: on wide screens the network is shown exactly as on a phone.
 * The app runs inside a phone-sized iframe (`?embed=1`), so every mobile layout, sheet and
 * fixed bar behaves the same as on a real device. The outer URL mirrors the inner route.
 */

const PHONE_W = 393;
const PHONE_H = 852;
const BEZEL = 12;

export const STAGE_QUERY = "(min-width: 900px)";

export function isEmbedded() {
  return new URLSearchParams(window.location.search).has("embed");
}

/** Pro dashboard and public booking pages are desktop tools; they keep the full-width layout. */
export function wantsStage() {
  if (isEmbedded()) return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (hash.startsWith("/biz") || hash.startsWith("/p/")) return false;
  return window.matchMedia(STAGE_QUERY).matches;
}

const SHORTCUTS: { label: string; hash: string }[] = [
  { label: "פיד", hash: "/" },
  { label: "גילוי", hash: "/discover" },
  { label: "פרופיל עסק", hash: "/b/b-nova" },
  { label: "מצב דמו", hash: "/demo" },
];

export function DesktopStage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || "/");
  const [src] = useState(() => `${window.location.pathname}?embed=1#${route}`);

  // Fit the phone to the viewport height without ever upscaling.
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerHeight - 48) / (PHONE_H + BEZEL * 2)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // Mirror the inner route into the outer URL so reload and shared links land on the same screen.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let detach = () => {};
    const attach = () => {
      detach();
      const win = el.contentWindow;
      if (!win) return;
      const sync = () => {
        const h = win.location.hash.replace(/^#/, "") || "/";
        setRoute(h);
        history.replaceState(null, "", `${window.location.pathname}#${h}`);
      };
      win.addEventListener("hashchange", sync);
      sync();
      detach = () => win.removeEventListener("hashchange", sync);
    };
    el.addEventListener("load", attach);
    return () => {
      el.removeEventListener("load", attach);
      detach();
    };
  }, []);

  // Typing a new #route in the address bar (or back/forward) drives the phone.
  useEffect(() => {
    const onOuter = () => {
      const h = window.location.hash.replace(/^#/, "") || "/";
      const win = frame.current?.contentWindow;
      if (win && win.location.hash.replace(/^#/, "") !== h) win.location.hash = h;
    };
    window.addEventListener("hashchange", onOuter);
    return () => window.removeEventListener("hashchange", onOuter);
  }, []);

  const go = (hash: string) => {
    const win = frame.current?.contentWindow;
    if (win) win.location.hash = hash;
  };

  const w = PHONE_W + BEZEL * 2;
  const h = PHONE_H + BEZEL * 2;

  return (
    <div className="stage">
      <aside className="stage-side stage-brand">
        <div className="stage-wordmark">Beautigo</div>
        <p className="stage-lede">רואים את העבודה. קובעים את התור. באותו מסך.</p>
      </aside>

      <div className="stage-phone-slot" style={{ width: w * scale, height: h * scale }}>
        <div className="stage-phone" style={{ width: w, height: h, transform: `scale(${scale})` }}>
          <iframe ref={frame} src={src} title="Beautigo" className="stage-screen" style={{ width: PHONE_W, height: PHONE_H }} allow="camera; microphone; clipboard-write; web-share; autoplay" />
        </div>
      </div>

      <aside className="stage-side stage-nav" aria-label="קיצורי דמו">
        <div className="stage-kicker">קפיצה מהירה</div>
        <ul>
          {SHORTCUTS.map((s) => (
            <li key={s.hash}>
              <button type="button" onClick={() => go(s.hash)} aria-current={route === s.hash ? "page" : undefined}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="stage-pro"
          onClick={() => {
            window.location.hash = "/biz";
            window.location.reload();
          }}
        >
          Beautigo Pro לעסקים ←
        </button>
      </aside>
    </div>
  );
}
