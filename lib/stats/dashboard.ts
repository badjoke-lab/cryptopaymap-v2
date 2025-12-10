export type CountryRanking = {
  country: string;
  owner: number;
  community: number;
  directory: number;
  unverified: number;
  total: number;
};

export type CategoryTrendPoint = {
  period: string;
  category: string;
  owner: number;
  community: number;
  directory: number;
  unverified: number;
  total: number;
};

export const countryRankings: CountryRanking[] = [
  { country: 'United States', owner: 72, community: 46, directory: 30, unverified: 16, total: 164 },
  { country: 'Canada', owner: 38, community: 29, directory: 18, unverified: 10, total: 95 },
  { country: 'Germany', owner: 34, community: 26, directory: 16, unverified: 9, total: 85 },
  { country: 'Argentina', owner: 29, community: 18, directory: 12, unverified: 8, total: 67 },
  { country: 'Philippines', owner: 26, community: 22, directory: 14, unverified: 9, total: 71 },
  { country: 'Nigeria', owner: 19, community: 15, directory: 11, unverified: 7, total: 52 },
  { country: 'Australia', owner: 24, community: 16, directory: 12, unverified: 7, total: 59 },
  { country: 'Portugal', owner: 15, community: 12, directory: 8, unverified: 5, total: 40 },
];

export const categoryTrends: {
  weekly: CategoryTrendPoint[];
  monthly: CategoryTrendPoint[];
} = {
  weekly: [
    { period: '2024-09-09', category: 'Dining', owner: 35, community: 18, directory: 12, unverified: 9, total: 74 },
    { period: '2024-09-09', category: 'Retail', owner: 21, community: 14, directory: 8, unverified: 6, total: 49 },
    { period: '2024-09-09', category: 'Services', owner: 18, community: 12, directory: 7, unverified: 5, total: 42 },

    { period: '2024-09-16', category: 'Dining', owner: 38, community: 19, directory: 13, unverified: 9, total: 79 },
    { period: '2024-09-16', category: 'Retail', owner: 22, community: 15, directory: 9, unverified: 7, total: 53 },
    { period: '2024-09-16', category: 'Services', owner: 19, community: 13, directory: 8, unverified: 6, total: 46 },

    { period: '2024-09-23', category: 'Dining', owner: 40, community: 21, directory: 14, unverified: 9, total: 84 },
    { period: '2024-09-23', category: 'Retail', owner: 24, community: 15, directory: 10, unverified: 7, total: 56 },
    { period: '2024-09-23', category: 'Services', owner: 20, community: 14, directory: 9, unverified: 6, total: 49 },

    { period: '2024-09-30', category: 'Dining', owner: 42, community: 22, directory: 15, unverified: 9, total: 88 },
    { period: '2024-09-30', category: 'Retail', owner: 26, community: 16, directory: 11, unverified: 7, total: 60 },
    { period: '2024-09-30', category: 'Services', owner: 21, community: 15, directory: 9, unverified: 7, total: 52 },

    { period: '2024-10-07', category: 'Dining', owner: 44, community: 24, directory: 16, unverified: 9, total: 93 },
    { period: '2024-10-07', category: 'Retail', owner: 27, community: 18, directory: 12, unverified: 8, total: 65 },
    { period: '2024-10-07', category: 'Services', owner: 23, community: 16, directory: 10, unverified: 7, total: 56 },

    { period: '2024-10-14', category: 'Dining', owner: 46, community: 25, directory: 17, unverified: 10, total: 98 },
    { period: '2024-10-14', category: 'Retail', owner: 29, community: 19, directory: 13, unverified: 8, total: 69 },
    { period: '2024-10-14', category: 'Services', owner: 24, community: 17, directory: 11, unverified: 8, total: 60 },

    { period: '2024-10-21', category: 'Dining', owner: 48, community: 26, directory: 18, unverified: 10, total: 102 },
    { period: '2024-10-21', category: 'Retail', owner: 31, community: 20, directory: 14, unverified: 8, total: 73 },
    { period: '2024-10-21', category: 'Services', owner: 25, community: 18, directory: 11, unverified: 8, total: 62 },
  ],
  monthly: [
    { period: '2024-06', category: 'Dining', owner: 28, community: 14, directory: 9, unverified: 6, total: 57 },
    { period: '2024-06', category: 'Retail', owner: 17, community: 11, directory: 7, unverified: 5, total: 40 },
    { period: '2024-06', category: 'Services', owner: 14, community: 10, directory: 6, unverified: 4, total: 34 },

    { period: '2024-07', category: 'Dining', owner: 31, community: 16, directory: 10, unverified: 7, total: 64 },
    { period: '2024-07', category: 'Retail', owner: 18, community: 12, directory: 8, unverified: 5, total: 43 },
    { period: '2024-07', category: 'Services', owner: 15, community: 11, directory: 6, unverified: 5, total: 37 },

    { period: '2024-08', category: 'Dining', owner: 33, community: 17, directory: 11, unverified: 7, total: 68 },
    { period: '2024-08', category: 'Retail', owner: 20, community: 13, directory: 8, unverified: 6, total: 47 },
    { period: '2024-08', category: 'Services', owner: 16, community: 12, directory: 7, unverified: 5, total: 40 },

    { period: '2024-09', category: 'Dining', owner: 36, community: 18, directory: 12, unverified: 8, total: 74 },
    { period: '2024-09', category: 'Retail', owner: 22, community: 14, directory: 9, unverified: 6, total: 51 },
    { period: '2024-09', category: 'Services', owner: 17, community: 13, directory: 7, unverified: 6, total: 43 },

    { period: '2024-10', category: 'Dining', owner: 39, community: 20, directory: 13, unverified: 8, total: 80 },
    { period: '2024-10', category: 'Retail', owner: 24, community: 15, directory: 10, unverified: 7, total: 56 },
    { period: '2024-10', category: 'Services', owner: 19, community: 14, directory: 8, unverified: 6, total: 47 },
  ],
};
