import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertWritableUser,
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  type LocalEmailPeriodType,
  sendLocalPeriodicEmail,
} from "@/lib/server/email/localPeriodicEmailService";

const periodicEmailRequestSchema = z.object({
  periodType: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserSession();
    assertWritableUser(user);

    const body: unknown = await request.json().catch(() => ({}));
    const parsedBody = periodicEmailRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Tipo email non valido.", issues: parsedBody.error.flatten() },
        { status: 400 }
      );
    }

    const result = await sendLocalPeriodicEmail(
      user.id,
      parsedBody.data.periodType as LocalEmailPeriodType
    );

    if (result.status === "sent") {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: result.error },
      { status: getPeriodicEmailErrorStatus(result.status) }
    );
  } catch (error) {
    if (error instanceof AuthSessionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
      );
    }

    console.error("[LOCAL_PERIODIC_EMAIL_ROUTE_ERROR]", error);
    return NextResponse.json(
      {
        error: "Impossibile inviare l'email",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

function getPeriodicEmailErrorStatus(
  status: Exclude<Awaited<ReturnType<typeof sendLocalPeriodicEmail>>["status"], "sent">
): number {
  if (status === "no_snapshot") {
    return 404;
  }

  return 400;
}
