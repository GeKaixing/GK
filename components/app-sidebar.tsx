"use client";

import type React from "react";

import {
  IconAd,
  IconChartBar,
  IconDashboard,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconSettings,
  IconUsers,
  IconCreditCard,
} from "@tabler/icons-react";
import Link from "next/link";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { DASHBOARD_NAV_ITEMS, type DashboardNavKey } from "@/lib/dashboard/navigation";

type SidebarItem = {
  title: string;
  url: string;
  icon: typeof IconDashboard;
};

export type DashboardSidebarUser = {
  name: string;
  email: string;
  avatar: string;
};

const ICON_MAP: Record<DashboardNavKey, typeof IconDashboard> = {
  businessHome: IconDashboard,
  affiliations: IconListDetails,
  radarIntelligence: IconChartBar,
  acquireHandles: IconFolder,
  hireTalent: IconUsers,
  vipSupport: IconHelp,
  billing: IconCreditCard,
  ads: IconAd,
  settings: IconSettings,
};

const defaultUser: DashboardSidebarUser = {
  name: "Gekaixing",
  email: "support@gekaixing.com",
  avatar: "/avatars/shadcn.jpg",
};

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  currentUser?: DashboardSidebarUser;
  labels: Record<DashboardNavKey, string>;
  brandLabel: string;
};

export function AppSidebar({ currentUser, labels, brandLabel, ...props }: AppSidebarProps): React.JSX.Element {
  const navMain: SidebarItem[] = DASHBOARD_NAV_ITEMS.map((item) => ({
    title: labels[item.key],
    url: item.href,
    icon: ICON_MAP[item.key],
  }));

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <Link href="/dashboard" className="font-bold">
                {brandLabel}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={currentUser ?? defaultUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
