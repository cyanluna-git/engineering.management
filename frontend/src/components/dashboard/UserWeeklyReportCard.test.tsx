import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UserWeeklyReportCard } from "./UserWeeklyReportCard";
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
          "weeklyReport.title": "Weekly Report",
          "weeklyReport.currentWeekLabel": `Current report week: ${options?.range ?? ""}`,
          "weeklyReport.loading": "Loading weekly report...",
          "weeklyReport.loadFailedTitle": "Failed to load weekly report",
          "weeklyReport.loadFailedBody": "Please try again in a moment.",
          "weeklyReport.statusDraft": "Draft",
          "weeklyReport.statusPublished": "Published",
          "weeklyReport.lastUpdated": `Last updated ${options?.date ?? ""}`,
          "weeklyReport.start": "Start report",
          "weeklyReport.edit": "Edit report",
          "weeklyReport.emptyTitle": "No weekly report for this week yet.",
          "weeklyReport.recent": "Recent Reports",
          "weeklyReport.currentBadge": "Current",
          "weeklyReport.editorTitle": "Edit Weekly Report",
          "weeklyReport.tabEdit": "Edit",
          "weeklyReport.tabPreview": "Preview",
          "weeklyReport.copyPrevious": "Copy last week",
          "weeklyReport.editorPlaceholder": "placeholder",
          "weeklyReport.previewEmpty": "Your Markdown preview will appear here.",
          "weeklyReport.cancel": "Cancel",
          "weeklyReport.save": "Save draft",
          "weeklyReport.saving": "Saving...",
          "weeklyReport.saveFailedTitle": "Failed to save weekly report",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    apiClient: {
      get: vi.fn().mockResolvedValue({ data: { projects: [] } }),
    },
    getCurrentWeeklyReport: vi.fn(),
    getWeeklyReportHistory: vi.fn(),
    upsertWeeklyReport: vi.fn(),
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

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

describe("UserWeeklyReportCard", () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "Gerald Park",
        position_id: "pos-1",
        role: "USER",
        is_active: true,
      },
    } as ReturnType<typeof useAuth>);

    mockedGetCurrentWeeklyReport.mockResolvedValue({
      scope: "user",
      team_scope_type: null,
      scope_id: "user-1",
      target_key: "user:user-1",
      week_start: "2026-03-09",
      week_end: "2026-03-15",
      week_key: "2026-W11",
      is_in_progress: true,
      report: null,
    });
    mockedGetWeeklyReportHistory.mockResolvedValue([
      {
        id: "report-prev",
        scope: "user",
        team_scope_type: null,
        scope_id: "user-1",
        target_key: "user:user-1",
        week_start: "2026-03-02",
        week_end: "2026-03-08",
        week_key: "2026-W10",
        is_in_progress: false,
        status: "draft",
        title: null,
        markdown_body: "## Previous Highlights",
        source_metadata: null,
        owner_user_id: "user-1",
        created_by_user_id: "user-1",
        updated_by_user_id: "user-1",
        published_by_user_id: null,
        published_at: null,
        created_at: "2026-03-08T09:00:00Z",
        updated_at: "2026-03-08T09:00:00Z",
      },
    ]);
    mockedUpsertWeeklyReport.mockResolvedValue({
      id: "report-1",
      scope: "user",
      team_scope_type: null,
      scope_id: "user-1",
      target_key: "user:user-1",
      week_start: "2026-03-09",
      week_end: "2026-03-15",
      week_key: "2026-W11",
      is_in_progress: true,
      status: "draft",
      title: null,
      markdown_body: "## Highlights",
      source_metadata: null,
      owner_user_id: "user-1",
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
      published_by_user_id: null,
      published_at: null,
      created_at: "2026-03-12T09:00:00Z",
      updated_at: "2026-03-12T09:00:00Z",
    });
  });

  it("renders the empty state and opens the editor", async () => {
    renderWithQueryClient(<UserWeeklyReportCard referenceDate={new Date("2026-03-11")} />);

    expect(await screen.findByText("Weekly Report")).toBeInTheDocument();
    expect(await screen.findByText("No weekly report for this week yet.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start report" }));

    expect(screen.getByText("Edit Weekly Report")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preview" })).toBeInTheDocument();
  });

  it("saves the current weekly report draft through the API", async () => {
    renderWithQueryClient(<UserWeeklyReportCard referenceDate={new Date("2026-03-11")} />);

    await screen.findByText("Weekly Report");
    await userEvent.click(screen.getByRole("button", { name: "Start report" }));

    // The editor renders per-project sections; type into the first visible textarea (Team section).
    const textareas = await screen.findAllByRole("textbox");
    await userEvent.type(textareas[0], "## Highlights");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(mockedUpsertWeeklyReport).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "user",
          reference_date: "2026-03-11",
          status: "published",
        })
      );
    });
  });

  it("dialog content is constrained to viewport with scroll region and pinned footer", async () => {
    renderWithQueryClient(<UserWeeklyReportCard referenceDate={new Date("2026-03-11")} />);

    await screen.findByText("Weekly Report");
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
    renderWithQueryClient(<UserWeeklyReportCard referenceDate={new Date("2026-03-11")} />);

    await screen.findByText("Weekly Report");
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

  it("renders an inline action trigger for the current user row", async () => {
    renderWithQueryClient(<UserWeeklyReportCard referenceDate={new Date("2026-03-11")} mode="action" />);

    await userEvent.click(await screen.findByRole("button", { name: "Start report" }));

    expect(screen.getByText("Edit Weekly Report")).toBeInTheDocument();
  });
});
