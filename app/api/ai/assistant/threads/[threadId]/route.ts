import { NextRequest, NextResponse } from "next/server";
import {
  AuthSessionError,
  requireUserSession,
} from "@/lib/server/auth/session";
import {
  deleteLocalAssistantThread,
  getLocalAssistantThreadDetail,
  isAssistantStoreError,
} from "@/lib/server/assistant/localAssistantThreadService";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await requireUserSession();
    const { threadId } = await params;
    return NextResponse.json(
      await getLocalAssistantThreadDetail(threadId, user.id)
    );
  } catch (error) {
    return handleThreadDetailRouteError(
      error,
      "[LOCAL_ASSISTANT_THREAD_DETAIL_GET_ERROR]"
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const user = await requireUserSession();
    const { threadId } = await params;
    await deleteLocalAssistantThread(threadId, user.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleThreadDetailRouteError(
      error,
      "[LOCAL_ASSISTANT_THREAD_DETAIL_DELETE_ERROR]"
    );
  }
}

function handleThreadDetailRouteError(error: unknown, logMessage: string) {
  if (error instanceof AuthSessionError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }
    );
  }

  if (isAssistantStoreError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { error: "Impossibile gestire il thread richiesto" },
    { status: 500 }
  );
}
