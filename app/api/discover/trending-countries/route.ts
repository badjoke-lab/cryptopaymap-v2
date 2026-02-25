import { discoverHandlers } from "@/lib/discover/server";

export const revalidate = 180;

export async function GET(request: Request) {
  return discoverHandlers.trendingCountries(request);
}
