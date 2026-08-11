import { create } from "zustand";

type Store = {
  // null until the client poller first reports; Sidebar falls back to the
  // server-rendered prop while null to avoid a first-frame flicker.
  hasLive: boolean | null;
  setHasLive: (hasLive: boolean) => void;
};

export const liveDotStore = create<Store>((set) => ({
  hasLive: null,
  setHasLive: (hasLive) => set({ hasLive }),
}));
