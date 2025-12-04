export type Place = {
  id: string;
  name: string;
  country: string;
  city: string;
  addressFull?: string | null;
  lat: number;
  lng: number;
  category: string;
  verification: "owner" | "community" | "directory" | "unverified";
  description?: string | null;
  supportedCrypto: string[];
  socialTwitter?: string | null;
  socialInstagram?: string | null;
  socialWebsite?: string | null;
  photos?: string[];
};
