export type Place = {
  id: string;
  name: string;
  category: string;
  verification: "owner" | "community" | "directory" | "unverified";
  lat: number;
  lng: number;
  country: string;
  city: string;
  address_full?: string | null;
  supported_crypto?: string[];
  photos?: string[] | null;
  social_twitter?: string | null;
  social_instagram?: string | null;
  social_website?: string | null;
  description?: string | null;

  // Legacy/compatibility fields (to be removed once API is updated)
  accepted?: string[];
  address?: string;
  website?: string | null;
  phone?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  amenities?: string[] | null;
  submitterName?: string | null;
  images?: string[];
  updatedAt?: string;
  coverImage?: string | null;
  about?: string | null;
  paymentNote?: string | null;
};
