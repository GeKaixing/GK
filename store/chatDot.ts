import { create } from "zustand";

type Store = {
  // null until the client poller first reports; Sidebar/MobileFooter fall back
  // to the server-rendered prop while null to avoid a first-frame flicker.
  hasUnreadChat: boolean | null;
  setHasUnreadChat: (hasUnreadChat: boolean) => void;
};

export const chatDotStore = create<Store>((set) => ({
  hasUnreadChat: null,
  setHasUnreadChat: (hasUnreadChat) => set({ hasUnreadChat }),
}));
