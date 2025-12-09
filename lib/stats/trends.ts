export type WeeklyTrendPoint = {
  date: string;
  owner: number;
  community: number;
  total: number;
};

export type MonthlyTrendPoint = {
  month: string;
  owner: number;
  community: number;
  total: number;
};

export const weeklyTrends: WeeklyTrendPoint[] = [
  { date: '2024-09-02', owner: 120, community: 68, total: 188 },
  { date: '2024-09-09', owner: 128, community: 70, total: 198 },
  { date: '2024-09-16', owner: 133, community: 72, total: 205 },
  { date: '2024-09-23', owner: 138, community: 75, total: 213 },
  { date: '2024-09-30', owner: 145, community: 79, total: 224 },
  { date: '2024-10-07', owner: 152, community: 82, total: 234 },
  { date: '2024-10-14', owner: 158, community: 86, total: 244 },
  { date: '2024-10-21', owner: 164, community: 89, total: 253 },
];

export const monthlyTrends: MonthlyTrendPoint[] = [
  { month: '2024-05', owner: 96, community: 52, total: 148 },
  { month: '2024-06', owner: 110, community: 58, total: 168 },
  { month: '2024-07', owner: 123, community: 64, total: 187 },
  { month: '2024-08', owner: 135, community: 71, total: 206 },
  { month: '2024-09', owner: 148, community: 78, total: 226 },
  { month: '2024-10', owner: 160, community: 84, total: 244 },
];
