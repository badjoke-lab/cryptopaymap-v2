import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { requireInternalAuth } from "@/lib/internalAuth";
import { tableExists } from "@/lib/internal-submissions";

export const runtime = "nodejs";

const MAX_LIMIT = 200;

const parseLimit = (value: string | null) => {
  if (!value) return 20;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_LIMIT);
};

const parsePage = (value: string | null) => {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
};

export async function GET(request: NextRequest) {
  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) return auth;

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { error: "DB_UNAVAILABLE" },
      { status: 503, headers: buildDataSourceHeaders("db", true) },
    );
  }

  const route = "api_internal_submissions_list";
  const { searchParams } = request.nextUrl;

  // status は submissions.status（存在する前提）
  const status = (searchParams.get("status") ?? "pending").toLowerCase();
  const kind = searchParams.get("kind"); // submissions.kind は無いので payload から参照する
  const q = searchParams.get("q");
  const limit = parseLimit(searchParams.get("limit"));
  const page = parsePage(searchParams.get("page"));
  const offset = (page - 1) * limit;

  try {
    const submissionsTableExists = await tableExists(route, "submissions");
    if (!submissionsTableExists) {
      return NextResponse.json(
        { error: "submissions table is missing" },
        { status: 500, headers: buildDataSourceHeaders("db", true) },
      );
    }

    const params: unknown[] = [];
    const where: string[] = [];

    // status=all のときは絞らない
    if (status && status !== "all") {
      params.push(status);
      where.push(`s.status = $${params.length}`);
    }

    // kind は submissions.kind ではなく payload->>'kind' にする
    if (kind) {
      params.push(kind);
      where.push(`(COALESCE(s.payload->>'kind','') = $${params.length})`);
    }

    // q 検索：存在しないカラム（s.name等）は参照しない
    if (q) {
      params.push(`%${q}%`);
      const m = `$${params.length}`;
      where.push(
        `(
          s.id ILIKE ${m}
          OR COALESCE(s.place_id,'') ILIKE ${m}
          OR COALESCE(s.submitted_by->>'name','') ILIKE ${m}
          OR COALESCE(s.submitted_by->>'email','') ILIKE ${m}
          OR COALESCE(s.payload->>'placeName','') ILIKE ${m}
          OR COALESCE(s.payload->>'name','') ILIKE ${m}
          OR COALESCE(s.payload->>'contactName','') ILIKE ${m}
          OR COALESCE(s.payload->>'contactEmail','') ILIKE ${m}
        )`,
      );
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // total
    const totalResult = await dbQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM submissions s ${whereClause}`,
      params,
      { route },
    );
    const total = totalResult.rows?.[0]?.total ?? null;

    // list
    // - submissions には name/country/city/kind/level 等が無い前提で payload から拾う
    // - place_name は places.name があればそれ、無ければ payload.placeName
    const listSql = `
      SELECT
        s.id,
        s.status,
        s.created_at,
        s.updated_at,
        s.place_id,
        COALESCE(p.name, s.payload->>'placeName') AS place_name,
        s.payload,
        s.submitted_by,
        s.reviewed_by,
        s.review_note
      FROM submissions s
      LEFT JOIN places p ON p.id = s.place_id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;

    const listParams = [...params, limit, offset];
    const listResult = await dbQuery<{
      id: string;
      status: string;
      created_at: string;
      updated_at: string | null;
      place_id: string | null;
      place_name: string | null;
      payload: unknown;
      submitted_by: Record<string, unknown> | null;
      reviewed_by: Record<string, unknown> | null;
      review_note: string | null;
    }>(listSql, listParams, { route });

    const items = listResult.rows ?? [];
    const hasMore = total !== null ? page * limit < total : items.length === limit;

    return NextResponse.json(
      {
        items,
        pageInfo: {
          page,
          limit,
          total,
          hasMore,
        },
      },
      { headers: buildDataSourceHeaders("db", false) },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "DB_UNAVAILABLE" },
        { status: 503, headers: buildDataSourceHeaders("db", true) },
      );
    }
    console.error("[internal submissions] failed to list", error);
    return NextResponse.json(
      { error: "Failed to load submissions" },
      { status: 500, headers: buildDataSourceHeaders("db", true) },
    );
  }
}
