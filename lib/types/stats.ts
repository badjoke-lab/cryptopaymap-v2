export type VerificationKey = "total" | "owner" | "community" | "directory" | "unverified";

export type VerificationTotals = Record<VerificationKey, number>;
