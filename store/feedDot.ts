import { create } from "zustand";

type Store = {
  // null until the client poller first reports; Sidebar/MobileFooter fall back
  // to the server-rendered prop while null to avoid a first-frame flicker.
  hasNewTweets: boolean | null;
  setHasNewTweets: (hasNewTweets: boolean) => void;
};

export const feedDotStore = create<Store>((set) => ({
  hasNewTweets: null,
  setHasNewTweets: (hasNewTweets) => set({ hasNewTweets }),
}));
