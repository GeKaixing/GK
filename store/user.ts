import { create } from "zustand";

type Store = {
  email: string;
  id: string;
  userid: string;
  name: string;
  user_background_image: string;
  user_avatar: string;
  isPremium:boolean;
  brief_introduction: string;
  followers: number; // 被关注数
  following: number; // 关注数
};

export const userStore = create<Store>()((set) => ({
  email: "",
  id: "",
  userid: "",
  isPremium:false,
  brief_introduction: "",
  name: "",
  user_background_image: "",
  user_avatar: "",
   followers: 0, // 被关注数
  following: 0. // 关注数
}));

/**
 * 客户端登录信号：store 的 id 为空即游客（未登录）。
 * 由 Sidebar 依据布局传入的 user 异步填充，游客态保持 ""。
 */
export const isLoggedIn = () => !!userStore.getState().id;
