export type VerificationKey = "total" | "owner" | "community" | "directory" | "unverified";

export type VerificationTotals = Record<VerificationKey, number>;

export type StatsPopulationScope = "map_displayable_places";

export type StatsTimeseriesGrain = "1h" | "1d" | "1w";
