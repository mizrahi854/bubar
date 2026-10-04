import { useEffect } from "react";
import { create } from "zustand";
import { backend, type Membership, type SessionUser } from "./backend";

interface S {
  ready: boolean;
  user: SessionUser | null;
  memberships: Membership[];
  businessId: string | null;
  setBusiness: (id: string) => void;
  refresh: () => Promise<void>;
}

const BIZ_KEY = "beautigo.pro.business";
const readBiz = () => {
  try {
    return localStorage.getItem(BIZ_KEY);
  } catch {
    return null;
  }
};

export const useSession = create<S>((set, get) => ({
  ready: false,
  user: null,
  memberships: [],
  businessId: readBiz(),
  setBusiness(id) {
    try {
      localStorage.setItem(BIZ_KEY, id);
    } catch {
      /* ignore */
    }
    set({ businessId: id });
  },
  async refresh() {
    const user = await backend.getUser();
    if (!user) return set({ ready: true, user: null, memberships: [] });
    await backend.claimInvites().catch(() => 0);
    const memberships = await backend.memberships();
    const current = get().businessId;
    const businessId = memberships.some((m) => m.business.id === current) ? current : (memberships[0]?.business.id ?? null);
    set({ ready: true, user, memberships, businessId });
  },
}));

let started = false;
/** Loads the session once and follows sign-in / sign-out. */
export function useSessionBoot() {
  useEffect(() => {
    if (started) return;
    started = true;
    void useSession.getState().refresh();
    backend.onAuthChange(() => void useSession.getState().refresh());
  }, []);
}

export function useMembership() {
  const { memberships, businessId } = useSession();
  return memberships.find((m) => m.business.id === businessId) ?? null;
}
