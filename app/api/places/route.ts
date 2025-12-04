import { NextResponse } from "next/server";

import type { Place } from "../../../types/places";

const places: Place[] = [
  {
    id: "cpm:tokyo:owner-cafe-1",
    name: "Satoshi Coffee",
    country: "JP",
    city: "Tokyo",
    addressFull: "1-1 Chiyoda, Tokyo",
    lat: 35.68,
    lng: 139.76,
    category: "cafe",
    verification: "owner",
    description: "A cozy Bitcoin-first cafe serving specialty coffee and fresh pastries.",
    supportedCrypto: ["BTC", "BTC@Lightning", "ETH"],
    socialWebsite: "https://satoshi-coffee.example.com",
    socialTwitter: "@satoshi_coffee",
    socialInstagram: "@satoshi.coffee",
    photos: [
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "cpm:newyork:community-diner-1",
    name: "Liberty Diner",
    country: "US",
    city: "New York",
    addressFull: "100 Liberty St, New York, NY",
    lat: 40.71,
    lng: -74.0,
    category: "diner",
    verification: "community",
    description: "Classic American diner with a crypto-friendly checkout experience.",
    supportedCrypto: ["BTC", "USDT"],
    socialTwitter: "@libertydiner",
    photos: [
      "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "cpm:paris:directory-bistro-1",
    name: "Bistro du Coin",
    country: "FR",
    city: "Paris",
    addressFull: "10 Rue de Paris, Paris",
    lat: 48.85,
    lng: 2.35,
    category: "restaurant",
    verification: "directory",
    description: "French bistro listed by the directory with seasonal menus.",
    supportedCrypto: ["BTC"],
    socialWebsite: "https://bistro.example.fr",
    socialInstagram: "@bistro.coin",
    photos: [],
  },
  {
    id: "cpm:sydney:unverified-bookstore-1",
    name: "Harbour Books",
    country: "AU",
    city: "Sydney",
    addressFull: "5 Harbour Rd, Sydney",
    lat: -33.86,
    lng: 151.2,
    category: "bookstore",
    verification: "unverified",
    description: null,
    supportedCrypto: ["BTC", "ETH"],
    photos: [
      "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=1200&q=80",
    ],
  },
  {
    id: "cpm:toronto:owner-bakery-1",
    name: "Maple Bakery",
    country: "CA",
    city: "Toronto",
    addressFull: "50 King St, Toronto",
    lat: 43.65,
    lng: -79.38,
    category: "bakery",
    verification: "owner",
    description: "Family-run bakery famous for maple-infused pastries.",
    supportedCrypto: ["BTC@Lightning"],
    socialWebsite: "https://maple-bakery.example.ca",
    socialInstagram: "@maplebakery",
    photos: [
      "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=1200&q=80",
    ],
  },
];

export async function GET() {
  return NextResponse.json(places);
}
