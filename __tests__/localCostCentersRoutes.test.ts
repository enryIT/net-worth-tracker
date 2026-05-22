import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalCostCenterMock,
  deleteLocalCostCenterMock,
  listLocalCostCentersMock,
  requireUserSessionMock,
  updateLocalCostCenterMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalCostCenterMock: vi.fn(),
  deleteLocalCostCenterMock: vi.fn(),
  listLocalCostCentersMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalCostCenterMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  AuthSessionError: class AuthSessionError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "AuthSessionError";
    }
  },
  assertWritableUser: assertWritableUserMock,
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/cashflow/localCostCenterService", () => ({
  createLocalCostCenter: createLocalCostCenterMock,
  deleteLocalCostCenter: deleteLocalCostCenterMock,
  listLocalCostCenters: listLocalCostCentersMock,
  updateLocalCostCenter: updateLocalCostCenterMock,
}));

import { GET, POST } from "@/app/api/cost-centers/route";
import { DELETE, PUT } from "@/app/api/cost-centers/[costCenterId]/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const params = Promise.resolve({ costCenterId: "cost-center-1" });

function createJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local cost centers routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("lists cost centers for the authenticated user", async () => {
    listLocalCostCentersMock.mockResolvedValue([{ id: "cost-center-1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalCostCentersMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual([{ id: "cost-center-1" }]);
  });

  it("returns 401 when listing without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates cost centers for writable users", async () => {
    createLocalCostCenterMock.mockResolvedValue({ id: "cost-center-1" });

    const response = await POST(
      createJsonRequest("http://localhost/api/cost-centers", {
        name: "Automobile",
        description: "Dacia",
        color: "#3b82f6",
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalCostCenterMock).toHaveBeenCalledWith("user-1", {
      name: "Automobile",
      description: "Dacia",
      color: "#3b82f6",
    });
  });

  it("rejects invalid cost center payloads", async () => {
    const response = await POST(
      createJsonRequest("http://localhost/api/cost-centers", {
        name: "",
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalCostCenterMock).not.toHaveBeenCalled();
  });

  it("updates cost centers for writable users", async () => {
    updateLocalCostCenterMock.mockResolvedValue({ id: "cost-center-1" });

    const response = await PUT(
      createJsonRequest("http://localhost/api/cost-centers/cost-center-1", {
        name: "Auto nuova",
        previousName: "Automobile",
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(updateLocalCostCenterMock).toHaveBeenCalledWith(
      "user-1",
      "cost-center-1",
      { name: "Auto nuova" },
      "Automobile"
    );
  });

  it("returns 404 when updating a non-owned cost center", async () => {
    updateLocalCostCenterMock.mockResolvedValue(null);

    const response = await PUT(
      createJsonRequest("http://localhost/api/cost-centers/cost-center-1", {
        name: "Auto nuova",
      }),
      { params }
    );

    expect(response.status).toBe(404);
  });

  it("deletes cost centers for writable users", async () => {
    deleteLocalCostCenterMock.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest("http://localhost/api/cost-centers/cost-center-1", {
        method: "DELETE",
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(deleteLocalCostCenterMock).toHaveBeenCalledWith(
      "user-1",
      "cost-center-1"
    );
  });
});
