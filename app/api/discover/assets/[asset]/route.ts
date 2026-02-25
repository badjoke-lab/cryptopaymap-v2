import { discoverHandlers } from "@/lib/discover/server";

export const revalidate = 180;

export async function GET(_request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  return discoverHandlers.assetPanel(asset);
}
