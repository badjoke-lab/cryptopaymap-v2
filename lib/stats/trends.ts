export type WeeklyTrendPoint = {
  date: string;
  owner: number;
  community: number;
  directory: number;
  unverified: number;
  total: number;
};

export type MonthlyTrendPoint = {
  month: string;
  owner: number;
  community: number;
  directory: number;
  unverified: number;
  total: number;
};

export const weeklyTrends: WeeklyTrendPoint[] = [
  { date: '2024-09-02', owner: 120, community: 68, directory: 42, unverified: 25, total: 255 },
  { date: '2024-09-09', owner: 128, community: 70, directory: 45, unverified: 24, total: 267 },
  { date: '2024-09-16', owner: 133, community: 72, directory: 48, unverified: 23, total: 276 },
  { date: '2024-09-23', owner: 138, community: 75, directory: 52, unverified: 22, total: 287 },
  { date: '2024-09-30', owner: 145, community: 79, directory: 55, unverified: 21, total: 300 },
  { date: '2024-10-07', owner: 152, community: 82, directory: 59, unverified: 20, total: 313 },
  { date: '2024-10-14', owner: 158, community: 86, directory: 63, unverified: 18, total: 325 },
  { date: '2024-10-21', owner: 164, community: 89, directory: 67, unverified: 17, total: 337 },
];

export const monthlyTrends: MonthlyTrendPoint[] = [
  { month: '2024-05', owner: 96, community: 52, directory: 35, unverified: 28, total: 211 },
  { month: '2024-06', owner: 110, community: 58, directory: 38, unverified: 26, total: 232 },
  { month: '2024-07', owner: 123, community: 64, directory: 42, unverified: 25, total: 254 },
  { month: '2024-08', owner: 135, community: 71, directory: 47, unverified: 24, total: 277 },
  { month: '2024-09', owner: 148, community: 78, directory: 52, unverified: 23, total: 301 },
  { month: '2024-10', owner: 160, community: 84, directory: 56, unverified: 22, total: 322 },
];
