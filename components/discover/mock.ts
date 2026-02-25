export type SectionStatus = 'loading' | 'success' | 'error';

export type ActivityTabKey = 'just-added' | 'owner' | 'community' | 'promoted';

export type ActivityItem = {
  id: string;
  name: string;
  city: string;
  country: string;
  verification: 'Owner Verified' | 'Community Verified' | 'Directory' | 'Unverified';
  assets: string[];
  timeLabel: string;
};

export type TrendingCountry = {
  code: string;
  country: string;
  growth30d: number;
};

export type StoryTabKey = 'auto' | 'monthly';

export type StoryMetric = {
  label: string;
  value: string;
};

export type StoryItem = {
  id: string;
  title: string;
  summary: string;
  badges: string[];
  date: string;
  body: string;
  metrics: StoryMetric[];
  mapHref: string;
  statsHref?: string;
};

export type MonthlyReportItem = {
  id: string;
  month: string;
  highlights: string[];
  date: string;
  body: string;
  metrics: StoryMetric[];
  mapHref: string;
  statsHref?: string;
};

export type FeaturedCity = {
  countryCode: string;
  city: string;
  country: string;
  totalPlaces: number;
  topCategory: string;
  topAssets: string[];
  verificationCounts: {
    owner: number;
    community: number;
    directory: number;
    unverified: number;
  };
};

export type AssetExplorerData = {
  assets: string[];
  countries: Array<{ code: string; country: string; total: number }>;
  categories: Array<{ key: string; label: string; total: number }>;
  recent: Array<{ id: string; name: string; city: string; country: string }>;
};

export type VerificationHubItem = {
  key: 'owner' | 'community' | 'directory' | 'unverified';
  title: string;
  summary: string;
  details: string;
};

export const discoverMockData = {
  activityTabs: [
    { key: 'just-added' as const, label: 'Just Added' },
    { key: 'owner' as const, label: 'Owner' },
    { key: 'community' as const, label: 'Community' },
    { key: 'promoted' as const, label: 'Promoted' },
  ],
  activityFeed: {
    'just-added': [
      {
        id: 'berlin-cafe-satoshi',
        name: 'Cafe Satoshi',
        city: 'Berlin',
        country: 'DE',
        verification: 'Owner Verified',
        assets: ['BTC', 'Lightning', 'ETH', 'USDT'],
        timeLabel: '2d ago',
      },
      {
        id: 'tokyo-lightning-ramen',
        name: 'Lightning Ramen',
        city: 'Tokyo',
        country: 'JP',
        verification: 'Community Verified',
        assets: ['BTC', 'Lightning'],
        timeLabel: '3d ago',
      },
      {
        id: 'lisbon-crypto-grocer',
        name: 'Crypto Grocer',
        city: 'Lisbon',
        country: 'PT',
        verification: 'Directory',
        assets: ['BTC', 'USDT', 'ETH'],
        timeLabel: '4d ago',
      },
      {
        id: 'seoul-pay-hub',
        name: 'Seoul Pay Hub',
        city: 'Seoul',
        country: 'KR',
        verification: 'Owner Verified',
        assets: ['BTC', 'USDT'],
        timeLabel: '5d ago',
      },
      {
        id: 'miami-beach-bites',
        name: 'Beach Bites',
        city: 'Miami',
        country: 'US',
        verification: 'Community Verified',
        assets: ['BTC', 'ETH', 'SOL'],
        timeLabel: '6d ago',
      },
      {
        id: 'buenos-aires-coffee',
        name: 'Mate & Blocks',
        city: 'Buenos Aires',
        country: 'AR',
        verification: 'Directory',
        assets: ['BTC', 'USDT'],
        timeLabel: '1w ago',
      },
      {
        id: 'warsaw-ledger-store',
        name: 'Ledger Store Warsaw',
        city: 'Warsaw',
        country: 'PL',
        verification: 'Owner Verified',
        assets: ['BTC', 'ETH', 'USDT', 'XMR'],
        timeLabel: '1w ago',
      },
      {
        id: 'melbourne-block-brew',
        name: 'Block Brew',
        city: 'Melbourne',
        country: 'AU',
        verification: 'Unverified',
        assets: ['BTC'],
        timeLabel: '1w ago',
      },
    ],
    owner: [
      {
        id: 'singapore-node-kitchen',
        name: 'Node Kitchen',
        city: 'Singapore',
        country: 'SG',
        verification: 'Owner Verified',
        assets: ['BTC', 'Lightning', 'USDT'],
        timeLabel: '3d ago',
      },
      {
        id: 'osaka-merchant-lab',
        name: 'Merchant Lab Osaka',
        city: 'Osaka',
        country: 'JP',
        verification: 'Owner Verified',
        assets: ['BTC', 'ETH'],
        timeLabel: '1w ago',
      },
    ],
    community: [
      {
        id: 'porto-crypto-bakery',
        name: 'Crypto Bakery',
        city: 'Porto',
        country: 'PT',
        verification: 'Community Verified',
        assets: ['BTC', 'Lightning'],
        timeLabel: '2d ago',
      },
      {
        id: 'taipei-pay-market',
        name: 'Pay Market',
        city: 'Taipei',
        country: 'TW',
        verification: 'Community Verified',
        assets: ['BTC', 'USDT', 'ETH'],
        timeLabel: '6d ago',
      },
    ],
    promoted: [],
  } as Record<ActivityTabKey, ActivityItem[]>,
  trendingCountries: [
    { code: 'DE', country: 'Germany', growth30d: 42 },
    { code: 'JP', country: 'Japan', growth30d: 31 },
    { code: 'PT', country: 'Portugal', growth30d: 24 },
    { code: 'AR', country: 'Argentina', growth30d: 18 },
    { code: 'US', country: 'United States', growth30d: 16 },
  ] as TrendingCountry[],
  storiesTabs: [
    { key: 'auto' as const, label: 'Auto Stories' },
    { key: 'monthly' as const, label: 'Monthly Report' },
  ],
  autoStories: [
    {
      id: 'tokyo-lightning-growth',
      title: 'Lightning acceptance is rising in Tokyo',
      summary: 'Owner-confirmed listings increased in major commuter districts over the last 30 days.',
      badges: ['City', 'Lightning'],
      date: '2026-02-04',
      body: 'Tokyo continues to add owner-verified cafes and shops that accept BTC and Lightning payments.',
      metrics: [
        { label: 'New places', value: '+14' },
        { label: 'Owner verified share', value: '61%' },
        { label: 'Top category', value: 'Cafe' },
      ],
      mapHref: '/map?country=JP&city=Tokyo',
      statsHref: '/stats',
    },
    {
      id: 'berlin-owner-verified',
      title: 'Berlin owner-verified places accelerate',
      summary: 'Community checks are being converted into owner confirmations across central neighborhoods.',
      badges: ['Country', 'Verification'],
      date: '2026-02-01',
      body: 'Berlin shows steady growth in owner-verified listings, especially for food and independent retail.',
      metrics: [
        { label: '30d growth', value: '+42' },
        { label: 'Owner verified', value: '74' },
      ],
      mapHref: '/map?country=DE&city=Berlin',
    },
    {
      id: 'lisbon-btc-cafes',
      title: 'Lisbon cafes continue broad BTC support',
      summary: 'BTC remains dominant while stablecoin support grows among late-night venues.',
      badges: ['City', 'BTC'],
      date: '2026-01-28',
      body: 'Lisbon cafe clusters now show strong BTC support with a growing mix of USDT and ETH acceptance.',
      metrics: [
        { label: 'Cafe listings', value: '52' },
        { label: 'BTC support', value: '88%' },
      ],
      mapHref: '/map?country=PT&city=Lisbon',
    },
    {
      id: 'buenos-aires-retail',
      title: 'Retail growth expands in Buenos Aires',
      summary: 'Directory and community submissions point to stronger crypto adoption in neighborhood retail.',
      badges: ['City', 'Retail'],
      date: '2026-01-25',
      body: 'Buenos Aires adds mixed verification listings in retail corridors with BTC and USDT as top assets.',
      metrics: [
        { label: 'New retail places', value: '+9' },
        { label: 'USDT support', value: '46%' },
      ],
      mapHref: '/map?country=AR&city=Buenos%20Aires',
    },
    {
      id: 'miami-tourism-corridor',
      title: 'Miami tourism corridor keeps expanding',
      summary: 'Visitors are finding more crypto-friendly points near transit and waterfront locations.',
      badges: ['Country', 'Travel'],
      date: '2026-01-22',
      body: 'Miami growth trends indicate continued additions in tourist-heavy areas with diverse asset support.',
      metrics: [
        { label: 'Recent additions', value: '+11' },
        { label: 'Top asset', value: 'BTC' },
      ],
      mapHref: '/map?country=US&city=Miami',
    },
    {
      id: 'seoul-directory-cleanup',
      title: 'Seoul listings improve verification quality',
      summary: 'Older directory entries are being refreshed with newer owner and community signals.',
      badges: ['City', 'Quality'],
      date: '2026-01-19',
      body: 'Seoul now shows higher data quality after updates to stale entries and accepted-asset fields.',
      metrics: [
        { label: 'Refreshed places', value: '27' },
        { label: 'Verification uplift', value: '+13%' },
      ],
      mapHref: '/map?country=KR&city=Seoul',
    },
  ] as StoryItem[],
  monthlyReports: [
    {
      id: 'monthly-2026-01',
      month: '2026-01',
      highlights: [
        'Owner-verified listings posted the highest monthly increase.',
        'Germany and Japan led net growth in tracked places.',
        'BTC and Lightning remained the most selected pair for new entries.',
      ],
      date: '2026-02-01',
      body: 'January showed steady listing growth with stronger verification coverage in major city hubs.',
      metrics: [
        { label: 'Net new places', value: '+128' },
        { label: 'Countries with growth', value: '24' },
        { label: 'Verified ratio', value: '63%' },
      ],
      mapHref: '/map?country=DE',
      statsHref: '/stats',
    },
    {
      id: 'monthly-2025-12',
      month: '2025-12',
      highlights: [
        'Community verification improved in city-level updates.',
        'Featured categories remained food, cafe, and retail.',
        'Stablecoin acceptance expanded in high-footfall districts.',
      ],
      date: '2026-01-01',
      body: 'December maintained broad momentum with strong contributions from community updates.',
      metrics: [
        { label: 'Net new places', value: '+94' },
        { label: 'Community verified growth', value: '+21%' },
      ],
      mapHref: '/map?country=PT',
    },
  ] as MonthlyReportItem[],
  featuredCities: [
    {
      countryCode: 'DE',
      city: 'Berlin',
      country: 'Germany',
      totalPlaces: 120,
      topCategory: 'Fast Food',
      topAssets: ['BTC', 'Lightning', 'ETH', 'USDT'],
      verificationCounts: { owner: 62, community: 24, directory: 21, unverified: 13 },
    },
    {
      countryCode: 'JP',
      city: 'Tokyo',
      country: 'Japan',
      totalPlaces: 83,
      topCategory: 'Cafe',
      topAssets: ['BTC', 'USDT'],
      verificationCounts: { owner: 39, community: 16, directory: 19, unverified: 9 },
    },
    {
      countryCode: 'AR',
      city: 'Buenos Aires',
      country: 'Argentina',
      totalPlaces: 65,
      topCategory: 'Retail',
      topAssets: ['BTC', 'ETH', 'USDT'],
      verificationCounts: { owner: 25, community: 15, directory: 14, unverified: 11 },
    },
    {
      countryCode: 'PT',
      city: 'Lisbon',
      country: 'Portugal',
      totalPlaces: 59,
      topCategory: 'Cafe',
      topAssets: ['BTC', 'Lightning', 'USDT'],
      verificationCounts: { owner: 27, community: 10, directory: 13, unverified: 9 },
    },
    {
      countryCode: 'US',
      city: 'Miami',
      country: 'United States',
      totalPlaces: 54,
      topCategory: 'Travel',
      topAssets: ['BTC', 'ETH', 'SOL', 'USDT'],
      verificationCounts: { owner: 21, community: 11, directory: 14, unverified: 8 },
    },
    {
      countryCode: 'KR',
      city: 'Seoul',
      country: 'South Korea',
      totalPlaces: 49,
      topCategory: 'Food',
      topAssets: ['BTC', 'USDT'],
      verificationCounts: { owner: 19, community: 9, directory: 12, unverified: 9 },
    },
  ] as FeaturedCity[],
  assetExplorer: {
    BTC: {
      assets: ['BTC', 'Lightning', 'ETH', 'USDT', 'SOL', 'XMR', 'TRX', 'BNB', 'DOGE', 'LTC', 'USDC', 'DAI'],
      countries: [
        { code: 'DE', country: 'Germany', total: 210 },
        { code: 'JP', country: 'Japan', total: 170 },
        { code: 'PT', country: 'Portugal', total: 144 },
        { code: 'US', country: 'United States', total: 133 },
        { code: 'AR', country: 'Argentina', total: 119 },
      ],
      categories: [
        { key: 'fast-food', label: 'Fast Food', total: 80 },
        { key: 'cafe', label: 'Cafe', total: 62 },
        { key: 'retail', label: 'Retail', total: 57 },
        { key: 'travel', label: 'Travel', total: 41 },
        { key: 'grocery', label: 'Grocery', total: 35 },
      ],
      recent: [
        { id: 'berlin-cafe-satoshi', name: 'Cafe Satoshi', city: 'Berlin', country: 'DE' },
        { id: 'tokyo-lightning-ramen', name: 'Lightning Ramen', city: 'Tokyo', country: 'JP' },
        { id: 'lisbon-crypto-grocer', name: 'Crypto Grocer', city: 'Lisbon', country: 'PT' },
        { id: 'seoul-pay-hub', name: 'Seoul Pay Hub', city: 'Seoul', country: 'KR' },
        { id: 'miami-beach-bites', name: 'Beach Bites', city: 'Miami', country: 'US' },
      ],
    },
    Lightning: {
      assets: ['BTC', 'Lightning', 'ETH', 'USDT', 'SOL', 'XMR', 'TRX', 'BNB', 'DOGE', 'LTC', 'USDC', 'DAI'],
      countries: [
        { code: 'DE', country: 'Germany', total: 90 },
        { code: 'JP', country: 'Japan', total: 74 },
        { code: 'PT', country: 'Portugal', total: 63 },
        { code: 'US', country: 'United States', total: 41 },
        { code: 'CZ', country: 'Czechia', total: 29 },
      ],
      categories: [
        { key: 'cafe', label: 'Cafe', total: 43 },
        { key: 'fast-food', label: 'Fast Food', total: 26 },
        { key: 'retail', label: 'Retail', total: 21 },
        { key: 'bar', label: 'Bar', total: 14 },
        { key: 'travel', label: 'Travel', total: 11 },
      ],
      recent: [
        { id: 'porto-crypto-bakery', name: 'Crypto Bakery', city: 'Porto', country: 'PT' },
        { id: 'singapore-node-kitchen', name: 'Node Kitchen', city: 'Singapore', country: 'SG' },
      ],
    },
  } as Record<string, AssetExplorerData>,
  verificationHub: [
    {
      key: 'owner',
      title: 'Owner Verified',
      summary: 'Listed by the business owner or an authorized representative.',
      details: 'These entries include direct owner submission and supporting verification signals when available.',
    },
    {
      key: 'community',
      title: 'Community Verified',
      summary: 'Confirmed by trusted community contributors.',
      details: 'Community verification reflects repeated checks from contributors who report on-the-ground acceptance.',
    },
    {
      key: 'directory',
      title: 'Directory',
      summary: 'Imported or aggregated from external public listings.',
      details: 'Directory entries can be useful starting points and may later be upgraded with owner or community verification.',
    },
    {
      key: 'unverified',
      title: 'Unverified',
      summary: 'New or pending entries awaiting additional checks.',
      details: 'Unverified does not mean incorrect; it means confirmation signals are still limited or in progress.',
    },
  ] as VerificationHubItem[],
};
