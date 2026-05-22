import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  LocalAuthError,
  registerLocalUser,
} from "@/lib/server/auth/localAuthService";

const registerRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .email({ message: "Inserisci un indirizzo email valido." }),
  password: z
    .string()
    .min(10, { message: "La password deve contenere almeno 10 caratteri." }),
  name: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsedBody = registerRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getRegisterValidationMessage(parsedBody.error) },
        { status: 400 }
      );
    }

    const user = await registerLocalUser({
      email: parsedBody.data.email,
      password: parsedBody.data.password,
      name: parsedBody.data.name,
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isDemo: user.isDemo,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof LocalAuthError) {
      const status =
        error.code === "REGISTRATION_BLOCKED"
          ? 403
          : error.code === "USER_EXISTS"
            ? 409
            : 400;

      return NextResponse.json({ error: error.message }, { status });
    }

    console.error("[LOCAL_REGISTER_ERROR]", error);
    return NextResponse.json(
      { error: "Si e verificato un errore durante la registrazione." },
      { status: 500 }
    );
  }
}

function getRegisterValidationMessage(error: z.ZodError): string {
  const firstIssue = error.issues[0];

  if (
    error.issues.some(
      (issue) =>
        (issue.path[0] === "email" || issue.path[0] === "password") &&
        issue.code === "invalid_type"
    )
  ) {
    return "Email e password sono obbligatorie.";
  }

  return firstIssue?.message ?? "Richiesta non valida.";
}
