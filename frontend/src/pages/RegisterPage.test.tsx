import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RegisterPage } from "./RegisterPage";
import {
  getDepartments,
  getDivisions,
  getJobPositionsList,
  getSubTeams,
  ssoRegister,
} from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useApiError } from "@/hooks/useApiError";
import type { JobPosition } from "@/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/useApiError", () => ({
  useApiError: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  getDepartments: vi.fn(),
  getDivisions: vi.fn(),
  getJobPositionsList: vi.fn(),
  getSubTeams: vi.fn(),
  ssoRegister: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseApiError = vi.mocked(useApiError);
const mockedGetDivisions = vi.mocked(getDivisions);
const mockedGetDepartments = vi.mocked(getDepartments);
const mockedGetSubTeams = vi.mocked(getSubTeams);
const mockedGetJobPositionsList = vi.mocked(getJobPositionsList);
const mockedSsoRegister = vi.mocked(ssoRegister);

function renderRegisterPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/register?token=header.eyJlbWFpbCI6Im5ldy51c2VyQGVkd2FyZHNjb20iLCJuYW1lIjoiU3lzdGVtIEFkbWluIn0=.signature"]}>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RegisterPage", () => {
  const login = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      login,
      logout: vi.fn(),
      user: null,
    } as ReturnType<typeof useAuth>);

    mockedUseApiError.mockReturnValue(() => "translated-error");

    mockedGetDivisions.mockResolvedValue([
      { id: "div-eng", name: "Engineering", code: "ENG", is_active: true },
    ]);

    mockedGetDepartments.mockResolvedValue([
      {
        id: "dept-npi-is",
        name: "NPI, Integrated System",
        code: "NPI_IS",
        business_unit_id: null,
        division_id: "div-eng",
        is_active: true,
      },
    ]);

    mockedGetSubTeams.mockResolvedValue([]);

    mockedGetJobPositionsList.mockResolvedValue([
      { id: "pos-1", name: "Engineer", is_active: true },
    ] as JobPosition[]);

    mockedSsoRegister.mockResolvedValue({
      access_token: "access-token",
      refresh_token: "refresh-token",
      token_type: "bearer",
    });
  });

  it("submits the selected hierarchical department during registration", async () => {
    const user = userEvent.setup();

    renderRegisterPage();

    await waitFor(() => {
      expect(mockedGetDivisions).toHaveBeenCalled();
      expect(mockedGetDepartments).toHaveBeenCalled();
    });

    await user.click(screen.getByTestId("register-organization-select"));
    await user.click(screen.getByRole("button", { name: "Expand Engineering" }));
    await user.click(screen.getByRole("button", { name: /^NPI, Integrated System$/ }));

    await waitFor(() => {
      expect(screen.getByTestId("register-organization-select")).toHaveTextContent(
        "Engineering > NPI, Integrated System"
      );
    });

    await user.type(screen.getByPlaceholderText("register.koreanNamePlaceholder"), "시스템관리자");

    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Engineer" }));

    await user.click(screen.getByRole("button", { name: "register.createAccount" }));

    await waitFor(() => {
      expect(mockedSsoRegister).toHaveBeenCalledWith({
        registration_token: "header.eyJlbWFpbCI6Im5ldy51c2VyQGVkd2FyZHNjb20iLCJuYW1lIjoiU3lzdGVtIEFkbWluIn0=.signature",
        name: "System Admin",
        korean_name: "시스템관리자",
        department_id: "dept-npi-is",
        position_id: "pos-1",
      });
    });

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith("access-token", "refresh-token");
    });
  });
});
