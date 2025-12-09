import { monthlyTrends, weeklyTrends } from '@/lib/stats/trends';

export async function GET() {
  return Response.json({ weekly: weeklyTrends, monthly: monthlyTrends });
}
