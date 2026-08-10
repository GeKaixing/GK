export interface DashboardSummary {
  totalUsers: number;
  totalPremiumUsers: number;
  totalPosts: number;
  totalReplies: number;
  totalMessages: number;
  weeklyNewUsers: number;
  weeklyNewPosts: number;
}

export interface DashboardTrendPoint {
  date: string;
  posts: number;
  replies: number;
}

export interface DashboardRecentPost {
  id: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  replyCount: number;
  shareCount: number;
  metrics: {
    impressions: number;
    postClicks: number;
    repliesReceived: number;
    profileEnters: number;
    impressionsPv: number;
    postClicksPv: number;
    repliesReceivedPv: number;
    profileEntersPv: number;
    postClickRate: number;
    replyRate: number;
    profileEnterRate: number;
  };
  author: {
    name: string | null;
    userid: string;
  };
}

export interface DashboardAffiliationItem {
  id: string;
  status: string;
  createdAt: Date;
  follower: {
    userid: string;
    name: string | null;
  };
  following: {
    userid: string;
    name: string | null;
  };
}

export interface DashboardUserActionItem {
  actionType: string;
  count: number;
}

export interface DashboardHotPostItem {
  id: string;
  content: string;
  createdAt: Date;
  likeCount: number;
  replyCount: number;
  shareCount: number;
  hotScore: number;
}

export interface DashboardHandleItem {
  id: string;
  userid: string;
  name: string | null;
  isPremium: boolean;
  createdAt: Date;
  postCount: number;
  followerCount: number;
}

export interface DashboardTalentItem {
  authorId: string;
  userid: string;
  name: string | null;
  postCount: number;
  replyCount: number;
  likeCount: number;
  shareCount: number;
  score: number;
}

export interface DashboardJobPostItem {
  id: string;
  title: string;
  company: string;
  description: string;
  locationType: string;
  seniority: string;
  employmentType: string;
  createdAt: Date;
}

export interface DashboardConversationItem {
  id: string;
  isGroup: boolean;
  name: string | null;
  messageCount: number;
  updatedAt: Date;
  participants: Array<{
    id: string;
    userid: string;
    name: string | null;
  }>;
}

export interface DashboardPremiumUserItem {
  id: string;
  userid: string;
  name: string | null;
  createdAt: Date;
  postCount: number;
}

export interface DashboardActionLogItem {
  id: string;
  actionType: string;
  createdAt: Date;
  user: {
    userid: string;
    name: string | null;
  };
  targetPostId: string | null;
}

export interface DashboardEngagementData {
  impressions: number;
  impressionsPrev: number;
  engagementRate: number;
  engagementRatePrev: number;
  replies: number;
  posts: number;
  dailyImpressions: Array<{ date: string; impressions: number }>;
}

export interface DashboardHomeData {
  summary: DashboardSummary;
  coreMetrics: {
    dau: number;
    wau: number;
    mau: number;
    newUsersToday: number;
    d1Retention: number;
    d7Retention: number;
    avgInteractionsPerActiveUser7d: number;
    interactions7d: number;
    activeUsers7d: number;
  };
  engagement: DashboardEngagementData;
  dauTrend: DashboardDauTrendPoint[];
  retentionCohorts: DashboardRetentionCohortItem[];
  retentionWeeklyCohorts: DashboardRetentionCohortItem[];
  rates: {
    impressions: number;
    postClicks: number;
    repliesReceived: number;
    profileEnters: number;
    impressionsPv: number;
    postClicksPv: number;
    repliesReceivedPv: number;
    profileEntersPv: number;
    postClickRate: number;
    replyRate: number;
    profileEnterRate: number;
  };
  trend: DashboardTrendPoint[];
  recentPosts: DashboardRecentPost[];
  trafficSources: DashboardTrafficSourceItem[];
  funnel: DashboardFunnelItem[];
  audienceSegments: DashboardAudienceSegmentItem[];
  contentSegments: DashboardContentSegmentItem[];
}

export interface DashboardDauTrendPoint {
  date: string;
  dau: number;
}

export interface DashboardRetentionCohortItem {
  cohortDate: string;
  users: number;
  d1Retention: number;
  d7Retention: number;
}

export interface DashboardTrafficSourceItem {
  source: string;
  impressions: number;
  postClicks: number;
  repliesReceived: number;
  profileEnters: number;
  impressionsPv: number;
  postClicksPv: number;
  repliesReceivedPv: number;
  profileEntersPv: number;
}

export interface DashboardFunnelItem {
  step: string;
  users: number;
  events: number;
  conversionFromPrev: number;
}

export interface DashboardAudienceSegmentItem {
  segment: string;
  users: number;
  impressions: number;
  postClicks: number;
  repliesReceived: number;
  profileEnters: number;
  impressionsPv: number;
  postClicksPv: number;
  repliesReceivedPv: number;
  profileEntersPv: number;
}

export interface DashboardContentSegmentItem {
  segment: string;
  posts: number;
  impressions: number;
  postClicks: number;
  repliesReceived: number;
  profileEnters: number;
  impressionsPv: number;
  postClicksPv: number;
  repliesReceivedPv: number;
  profileEntersPv: number;
  postClickRate: number;
  replyRate: number;
  profileEnterRate: number;
}

export interface DashboardAffiliationsData {
  summary: {
    totalLinks: number;
    followingLinks: number;
    blockedLinks: number;
    requestedLinks: number;
  };
  links: DashboardAffiliationItem[];
}

export interface DashboardRadarData {
  actionSummary: DashboardUserActionItem[];
  trend: DashboardTrendPoint[];
  hotPosts: DashboardHotPostItem[];
}

export interface DashboardAcquireHandlesData {
  summary: {
    totalUsers: number;
    premiumUsers: number;
    activeCreators: number;
  };
  handles: DashboardHandleItem[];
}

export interface DashboardHireTalentData {
  summary: {
    totalJobPosts: number;
    remoteJobPosts: number;
    hybridJobPosts: number;
  };
  jobPosts: DashboardJobPostItem[];
}

export interface DashboardSupportData {
  summary: {
    totalConversations: number;
    conversationsWithRecentActivity: number;
    stalledConversations: number;
  };
  conversations: DashboardConversationItem[];
}

export interface DashboardBillingData {
  summary: {
    totalUsers: number;
    premiumUsers: number;
    premiumRate: number;
    newPremiumUsers7d: number;
  };
  premiumUsers: DashboardPremiumUserItem[];
}

export interface DashboardSettingsData {
  summary: {
    totalActions: number;
    actionsToday: number;
    environmentReady: boolean;
  };
  recentActions: DashboardActionLogItem[];
}
