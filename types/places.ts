export type Place = {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  verification: "owner" | "community" | "directory" | "unverified";
  accepted: string[];
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  updatedAt: string;
};
