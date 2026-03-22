import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TeamCapacityPage from "./TeamCapacityPage";
import { getDepartments, getSubTeams } from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useTeamCapacity, useTeamMembers } from "@/hooks/useTeamCapacity";

vi.mock("recharts", () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: passthrough,
    AreaChart: passthrough,
    Area: passthrough,
    XAxis: passthrough,
    YAxis: passthrough,
    CartesianGrid: passthrough,
    Tooltip: passthrough,
    Legend: passthrough,
  };
});

vi.mock("@/components/absences/AbsenceList", () => ({
  AbsenceList: () => <div data-testid="absence-list">absence list</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  getDepartments: vi.fn(),
  getSubTeams: vi.fn(),
}));

vi.mock("@/hooks/useTeamCapacity", () => ({
  useTeamCapacity: vi.fn(),
  useTeamMembers: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetDepartments = vi.mocked(getDepartments);
const mockedGetSubTeams = vi.mocked(getSubTeams);
const mockedUseTeamCapacity = vi.mocked(useTeamCapacity);
const mockedUseTeamMembers = vi.mocked(useTeamMembers);

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("TeamCapacityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Engineer",
        position_id: "pos-1",
        role: "USER",
        is_active: true,
        department_id: "dept-eci",
        sub_team_id: "sub-software-is",
      },
    } as ReturnType<typeof useAuth>);

    mockedGetDepartments.mockResolvedValue([
      { id: "dept-eci", name: "Electrical, Controls & Instrumentation", code: "ECI", is_active: true },
      { id: "dept-test", name: "Test&Validation", code: "TNV", is_active: true },
    ]);

    mockedGetSubTeams.mockImplementation(async (departmentId: string) => {
      if (departmentId !== "dept-eci") {
        return [];
      }

      return [
        {
          id: "sub-software-is",
          department_id: "dept-eci",
          name: "Software (IS)",
          code: "SWIS",
          is_active: true,
        },
      ];
    });

    mockedUseTeamCapacity.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useTeamCapacity>);

    mockedUseTeamMembers.mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useTeamMembers>);
  });

  it("defaults the capacity filters to the signed-in user's team", async () => {
    renderWithQueryClient(<TeamCapacityPage />);

    await waitFor(() => {
      expect(mockedGetSubTeams).toHaveBeenCalledWith("dept-eci");
    });

    await waitFor(() => {
      expect(
        mockedUseTeamCapacity.mock.calls.some(
          ([params]) =>
            params.department_id === "dept-eci" && params.sub_team_id === "sub-software-is"
        )
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        mockedUseTeamMembers.mock.calls.some(
          ([params]) =>
            params.department_id === "dept-eci" && params.sub_team_id === "sub-software-is"
        )
      ).toBe(true);
    });
  });
});
