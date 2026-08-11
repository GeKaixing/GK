export type DashboardNavKey =
  | "businessHome"
  | "affiliations"
  | "radarIntelligence"
  | "acquireHandles"
  | "hireTalent"
  | "vipSupport"
  | "billing"
  | "ads"
  | "settings";

export interface DashboardNavItem {
  key: DashboardNavKey;
  href: string;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { key: "businessHome", href: "/dashboard" },
  { key: "affiliations", href: "/dashboard/affiliations" },
  { key: "radarIntelligence", href: "/dashboard/radar-intelligence" },
  { key: "acquireHandles", href: "/dashboard/acquire-handles" },
  { key: "hireTalent", href: "/dashboard/hire-talent" },
  { key: "vipSupport", href: "/dashboard/vip-support" },
  { key: "billing", href: "/dashboard/billing" },
  { key: "ads", href: "/dashboard/ads" },
  { key: "settings", href: "/dashboard/settings" },
];

export const DASHBOARD_HOME_PATH = "/dashboard";
