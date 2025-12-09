export type CountryRanking = {
  country: string;
  owner: number;
  community: number;
  total: number;
};

export type CategoryTrendPoint = {
  period: string;
  category: string;
  owner: number;
  community: number;
  total: number;
};

export const countryRankings: CountryRanking[] = [
  { country: 'United States', owner: 72, community: 46, total: 118 },
  { country: 'Canada', owner: 38, community: 29, total: 67 },
  { country: 'Germany', owner: 34, community: 26, total: 60 },
  { country: 'Argentina', owner: 29, community: 18, total: 47 },
  { country: 'Philippines', owner: 26, community: 22, total: 48 },
  { country: 'Nigeria', owner: 19, community: 15, total: 34 },
  { country: 'Australia', owner: 24, community: 16, total: 40 },
  { country: 'Portugal', owner: 15, community: 12, total: 27 },
];

export const categoryTrends: {
  weekly: CategoryTrendPoint[];
  monthly: CategoryTrendPoint[];
} = {
  weekly: [
    { period: '2024-09-09', category: 'Dining', owner: 35, community: 18, total: 53 },
    { period: '2024-09-09', category: 'Retail', owner: 21, community: 14, total: 35 },
    { period: '2024-09-09', category: 'Services', owner: 18, community: 12, total: 30 },

    { period: '2024-09-16', category: 'Dining', owner: 38, community: 19, total: 57 },
    { period: '2024-09-16', category: 'Retail', owner: 22, community: 15, total: 37 },
    { period: '2024-09-16', category: 'Services', owner: 19, community: 13, total: 32 },

    { period: '2024-09-23', category: 'Dining', owner: 40, community: 21, total: 61 },
    { period: '2024-09-23', category: 'Retail', owner: 24, community: 15, total: 39 },
    { period: '2024-09-23', category: 'Services', owner: 20, community: 14, total: 34 },

    { period: '2024-09-30', category: 'Dining', owner: 42, community: 22, total: 64 },
    { period: '2024-09-30', category: 'Retail', owner: 26, community: 16, total: 42 },
    { period: '2024-09-30', category: 'Services', owner: 21, community: 15, total: 36 },

    { period: '2024-10-07', category: 'Dining', owner: 44, community: 24, total: 68 },
    { period: '2024-10-07', category: 'Retail', owner: 27, community: 18, total: 45 },
    { period: '2024-10-07', category: 'Services', owner: 23, community: 16, total: 39 },

    { period: '2024-10-14', category: 'Dining', owner: 46, community: 25, total: 71 },
    { period: '2024-10-14', category: 'Retail', owner: 29, community: 19, total: 48 },
    { period: '2024-10-14', category: 'Services', owner: 24, community: 17, total: 41 },

    { period: '2024-10-21', category: 'Dining', owner: 48, community: 26, total: 74 },
    { period: '2024-10-21', category: 'Retail', owner: 31, community: 20, total: 51 },
    { period: '2024-10-21', category: 'Services', owner: 25, community: 18, total: 43 },
  ],
  monthly: [
    { period: '2024-06', category: 'Dining', owner: 28, community: 14, total: 42 },
    { period: '2024-06', category: 'Retail', owner: 17, community: 11, total: 28 },
    { period: '2024-06', category: 'Services', owner: 14, community: 10, total: 24 },

    { period: '2024-07', category: 'Dining', owner: 31, community: 16, total: 47 },
    { period: '2024-07', category: 'Retail', owner: 18, community: 12, total: 30 },
    { period: '2024-07', category: 'Services', owner: 15, community: 11, total: 26 },

    { period: '2024-08', category: 'Dining', owner: 33, community: 17, total: 50 },
    { period: '2024-08', category: 'Retail', owner: 20, community: 13, total: 33 },
    { period: '2024-08', category: 'Services', owner: 16, community: 12, total: 28 },

    { period: '2024-09', category: 'Dining', owner: 36, community: 18, total: 54 },
    { period: '2024-09', category: 'Retail', owner: 22, community: 14, total: 36 },
    { period: '2024-09', category: 'Services', owner: 17, community: 13, total: 30 },

    { period: '2024-10', category: 'Dining', owner: 39, community: 20, total: 59 },
    { period: '2024-10', category: 'Retail', owner: 24, community: 15, total: 39 },
    { period: '2024-10', category: 'Services', owner: 19, community: 14, total: 33 },
  ],
};
