import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TeamWeeklyReportCard } from "./TeamWeeklyReportCard";
import {
  getCurrentWeeklyReport,
  getWeeklyReportHistory,
  upsertWeeklyReport,
} from "@/api/client";
import { useAuth } from "@/hooks/useAuth";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      (
        {
          "weeklyReport.teamTitle": "Team Weekly Report",
          "weeklyReport.currentWeekLabel": `Current report week: ${options?.range ?? ""}`,
          "weeklyReport.loading": "Loading weekly report...",
          "weeklyReport.loadFailedTitle": "Failed to load weekly report",
          "weeklyReport.loadFailedBody": "Please try again in a moment.",
          "weeklyReport.statusDraft": "Draft",
          "weeklyReport.statusPublished": "Published",
          "weeklyReport.lastUpdated": `Last updated ${options?.date ?? ""}`,
          "weeklyReport.start": "Start report",
          "weeklyReport.edit": "Edit report",
          "weeklyReport.recent": "Recent Reports",
          "weeklyReport.currentBadge": "Current",
          "weeklyReport.teamEditorTitle": "Edit Team Weekly Report",
          "weeklyReport.tabEdit": "Edit",
          "weeklyReport.tabPreview": "Preview",
          "weeklyReport.copyPrevious": "Copy last week",
          "weeklyReport.teamEditorPlaceholder": "placeholder",
          "weeklyReport.previewEmpty": "Your Markdown preview will appear here.",
          "weeklyReport.cancel": "Cancel",
          "weeklyReport.save": "Save draft",
          "weeklyReport.saving": "Saving...",
          "weeklyReport.saveFailedTitle": "Failed to save weekly report",
          "weeklyReport.teamEmptyTitle": "No team weekly report for this week yet.",
          "weeklyReport.teamScopeDepartment": "Department",
          "weeklyReport.teamScopeSubTeam": "Sub-Team",
          "weeklyReport.teamUnsupportedTitle": "Weekly reports are not available for this scope",
          "weeklyReport.teamUnsupportedBody": "Team weekly reports currently support department and sub-team views only.",
          "weeklyReport.teamUnsupportedScope": "This scope is not supported for weekly reports.",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    getCurrentWeeklyReport: vi.fn(),
    getWeeklyReportHistory: vi.fn(),
    upsertWeeklyReport: vi.fn(),
  };
});

const mockedGetCurrentWeeklyReport = vi.mocked(getCurrentWeeklyReport);
const mockedGetWeeklyReportHistory = vi.mocked(getWeeklyReportHistory);
const mockedUpsertWeeklyReport = vi.mocked(upsertWeeklyReport);
const mockedUseAuth = vi.mocked(useAuth);

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("TeamWeeklyReportCard", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Test Manager",
        position_id: "pos-1",
        role: "FM",
        is_active: true,
      },
    } as ReturnType<typeof useAuth>);
    mockedGetCurrentWeeklyReport.mockResolvedValue({
      scope: "team",
      team_scope_type: "department",
      scope_id: "DEPT_TEST",
      target_key: "department:DEPT_TEST",
      week_start: "2026-03-09",
      week_end: "2026-03-15",
      week_key: "2026-W11",
      is_in_progress: true,
      report: null,
    });
    mockedGetWeeklyReportHistory.mockResolvedValue([
      {
        id: "team-report-prev",
        scope: "team",
        team_scope_type: "department",
        scope_id: "DEPT_TEST",
        target_key: "department:DEPT_TEST",
        week_start: "2026-03-02",
        week_end: "2026-03-08",
        week_key: "2026-W10",
        is_in_progress: false,
        status: "draft",
        title: null,
        markdown_body: "## Previous Team Highlights",
        source_metadata: null,
        owner_user_id: null,
        created_by_user_id: "user-1",
        updated_by_user_id: "user-1",
        published_by_user_id: null,
        published_at: null,
        created_at: "2026-03-08T09:00:00Z",
        updated_at: "2026-03-08T09:00:00Z",
      },
    ]);
    mockedUpsertWeeklyReport.mockResolvedValue({
      id: "team-report-1",
      scope: "team",
      team_scope_type: "department",
      scope_id: "DEPT_TEST",
      target_key: "department:DEPT_TEST",
      week_start: "2026-03-09",
      week_end: "2026-03-15",
      week_key: "2026-W11",
      is_in_progress: true,
      status: "draft",
      title: null,
      markdown_body: "## Team Highlights",
      source_metadata: null,
      owner_user_id: null,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      published_by_user_id: null,
      published_at: null,
      created_at: "2026-03-12T09:00:00Z",
      updated_at: "2026-03-12T09:00:00Z",
    });
  });

  it("shows an informational state for unsupported scopes", async () => {
    renderWithQueryClient(
      <TeamWeeklyReportCard
        teamScope="business_unit"
        referenceDate={new Date("2026-03-11")}
        teamName="Engineering"
      />
    );

    expect(await screen.findByText("Team Weekly Report")).toBeInTheDocument();
    expect(screen.getByText("Weekly reports are not available for this scope")).toBeInTheDocument();
    expect(mockedGetCurrentWeeklyReport).not.toHaveBeenCalled();
  });

  it("saves a department weekly report draft", async () => {
    renderWithQueryClient(
      <TeamWeeklyReportCard
        teamScope="department"
        selectedOrgId="DEPT_TEST"
        referenceDate={new Date("2026-03-11")}
        teamName="Software Team"
      />
    );

    await screen.findByText("Team Weekly Report");
    await userEvent.click(screen.getByRole("button", { name: "Start report" }));

    await userEvent.click(screen.getByRole("button", { name: "1." }));
    await userEvent.type(screen.getByLabelText("Edit", { selector: "textarea" }), "## Team Highlights");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(mockedUpsertWeeklyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "team",
          team_scope_type: "department",
          scope_id: "DEPT_TEST",
          reference_date: "2026-03-11",
          markdown_body: "1. ## Team Highlights",
          status: "published",
        })
      );
    });
  });

  it("copies the previous team weekly report body into the editor", async () => {
    renderWithQueryClient(
      <TeamWeeklyReportCard
        teamScope="department"
        selectedOrgId="DEPT_TEST"
        referenceDate={new Date("2026-03-11")}
        teamName="Software Team"
      />
    );

    await screen.findByText("Team Weekly Report");
    await userEvent.click(screen.getByRole("button", { name: "Start report" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy last week" }));

    expect(screen.getByLabelText("Edit", { selector: "textarea" })).toHaveValue("## Previous Team Highlights");
  });

  it("dialog content is constrained to viewport with scroll region and pinned footer", async () => {
    renderWithQueryClient(
      <TeamWeeklyReportCard
        teamScope="department"
        selectedOrgId="DEPT_TEST"
        referenceDate={new Date("2026-03-11")}
        teamName="Software Team"
      />
    );

    await screen.findByText("Team Weekly Report");
    await userEvent.click(screen.getByRole("button", { name: "Start report" }));

    const dialog = screen.getByRole("dialog");
    // Verify the viewport-height cap and flex column layout are present.
    expect(dialog.className).toMatch(/max-h-\[85vh\]/);
    expect(dialog.className).toMatch(/overflow-hidden/);
    expect(dialog.className).toMatch(/flex/);
    expect(dialog.className).toMatch(/flex-col/);

    // Verify there is an internal scroll region.
    const scrollRegion = dialog.querySelector(".overflow-y-auto");
    expect(scrollRegion).not.toBeNull();

    // Save and Cancel must be outside the scroll region so they stay reachable.
    const saveBtn = screen.getByRole("button", { name: "Save draft" });
    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    expect(scrollRegion).not.toContainElement(saveBtn);
    expect(scrollRegion).not.toContainElement(cancelBtn);
  });

  it("save error alert renders outside the scrollable region", async () => {
    mockedUpsertWeeklyReport.mockRejectedValueOnce({ response: { data: { detail: "Server error" } } });
    renderWithQueryClient(
      <TeamWeeklyReportCard
        teamScope="department"
        selectedOrgId="DEPT_TEST"
        referenceDate={new Date("2026-03-11")}
        teamName="Software Team"
      />
    );

    await screen.findByText("Team Weekly Report");
    await userEvent.click(screen.getByRole("button", { name: "Start report" }));
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByText("Failed to save weekly report");

    const dialog = screen.getByRole("dialog");
    const scrollRegion = dialog.querySelector(".overflow-y-auto");
    const errorHeading = screen.getByText("Failed to save weekly report");
    const errorAlert = errorHeading.closest('[role="alert"]') as HTMLElement | null;
    expect(errorAlert).not.toBeNull();
    expect(scrollRegion).not.toContainElement(errorAlert!);
  });
});
