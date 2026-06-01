import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  getLocalPerformanceCache,
  setLocalPerformanceCache,
} from "@/lib/server/performance/localPerformanceCacheService";

const performanceCacheWriteSchema = z.object({
  cacheKey: z.string().trim().min(1),
  data: z.record(z.string(), z.unknown()),
});

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await getLocalPerformanceCache(user.id));
  } catch (error) {
    return handlePerformanceCacheRouteError(error, "[LOCAL_PERFORMANCE_CACHE_GET_ERROR]");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json();
    const parsedBody = performanceCacheWriteSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Payload cache performance non valido." },
        { status: 400 }
      );
    }

    await setLocalPerformanceCache(
      user.id,
      parsedBody.data.cacheKey,
      parsedBody.data.data
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handlePerformanceCacheRouteError(error, "[LOCAL_PERFORMANCE_CACHE_PUT_ERROR]");
  }
}

function handlePerformanceCacheRouteError(error: unknown, logTag: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  console.error(logTag, error);
  return NextResponse.json(
    { error: "Si e verificato un errore durante la cache performance." },
    { status: 500 }
  );
}
