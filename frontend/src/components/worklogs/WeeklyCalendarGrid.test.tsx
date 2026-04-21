/**
 * Tests for WeeklyCalendarGrid — per-day meeting import button behaviour
 * (Task #2605)
 */
import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { startOfWeek } from "date-fns";

import { WeeklyCalendarGrid } from "./WeeklyCalendarGrid";
import type { WorkLog } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "calendar.dayMon": "Mon",
          "calendar.dayTue": "Tue",
          "calendar.dayWed": "Wed",
          "calendar.dayThu": "Thu",
          "calendar.dayFri": "Fri",
          "calendar.daySat": "Sat",
          "calendar.daySun": "Sun",
          "calendar.dragHint": "Drag to move",
          "calendar.aiEntry": "AI entry",
          "calendar.dayMeetingImport": "Import today's meetings",
          "calendar.addEntry": "Add entry",
          "calendar.dropHere": "Drop here",
          "calendar.total": "Total",
        } as Record<string, string>
      )[key] ?? key,
    i18n: { language: "en" },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

// startOfWeek({weekStartsOn:1}) on a Tuesday (2026-04-21) gives the preceding Monday (2026-04-20)
const WEEK_START = startOfWeek(new Date("2026-04-21"), { weekStartsOn: 1 }); // Mon 2026-04-20
// Derived date strings used across tests
const MON = "2026-04-20";
const WED = "2026-04-22";
const EMPTY_WORKLOGS: WorkLog[] = [];

// Base props required by the component
const baseProps = {
  weekStart: WEEK_START,
  worklogs: EMPTY_WORKLOGS,
  onCellClick: vi.fn(),
  onWorklogEdit: vi.fn(),
  onWorklogDelete: vi.fn(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("WeeklyCalendarGrid — per-day meeting import button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Visibility guards
  // -------------------------------------------------------------------------

  it("does NOT render any import button when calendarConnected is false (default)", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        // calendarConnected defaults to false
      />
    );

    const buttons = screen.queryAllByTitle("Import today's meetings");
    expect(buttons).toHaveLength(0);
  });

  it("does NOT render import buttons when calendarConnected is explicitly false", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        calendarConnected={false}
      />
    );

    expect(
      screen.queryAllByTitle("Import today's meetings")
    ).toHaveLength(0);
  });

  it("does NOT render import buttons when calendarConnected is true but no callback is provided", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        calendarConnected={true}
        // onDayMeetingImportClick intentionally omitted
      />
    );

    expect(
      screen.queryAllByTitle("Import today's meetings")
    ).toHaveLength(0);
  });

  it("renders one import button per day column (7) when calendarConnected is true", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        calendarConnected={true}
      />
    );

    const buttons = screen.getAllByTitle("Import today's meetings");
    expect(buttons).toHaveLength(7);
  });

  it("import buttons carry the correct aria-label for accessibility", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        calendarConnected={true}
      />
    );

    const buttons = screen.getAllByRole("button", {
      name: "Import today's meetings",
    });
    expect(buttons).toHaveLength(7);
  });

  // -------------------------------------------------------------------------
  // Click behaviour
  // -------------------------------------------------------------------------

  it("calls onDayMeetingImportClick with the correct dateStr when a button is clicked", async () => {
    const onDayMeetingImportClick = vi.fn();
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={onDayMeetingImportClick}
        calendarConnected={true}
      />
    );

    const buttons = screen.getAllByTitle("Import today's meetings");
    // Click the first day (Mon 2026-04-20) — WEEK_START is Mon 2026-04-20
    await userEvent.click(buttons[0]);

    expect(onDayMeetingImportClick).toHaveBeenCalledTimes(1);
    // The date passed should match Monday of the test week
    expect(onDayMeetingImportClick).toHaveBeenCalledWith(MON);
  });

  // -------------------------------------------------------------------------
  // Loading / spinner state
  // -------------------------------------------------------------------------

  it("disables the button for the importing date and shows a spinner", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        calendarConnected={true}
        importingDate={MON}
      />
    );

    const buttons = screen.getAllByTitle("Import today's meetings");
    // First button (Mon 2026-04-20) must be disabled
    expect(buttons[0]).toBeDisabled();
    // Remaining buttons must NOT be disabled
    for (const btn of buttons.slice(1)) {
      expect(btn).not.toBeDisabled();
    }
  });

  it("renders Loader2 spinner (animate-spin class) on the importing-date button", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        calendarConnected={true}
        importingDate={MON}
      />
    );

    const buttons = screen.getAllByTitle("Import today's meetings");
    // The spinner SVG inside the first button (Mon) should have the animate-spin class.
    // SVG elements expose className as SVGAnimatedString in jsdom; use getAttribute("class") instead.
    const spinnerIcon = buttons[0].querySelector("svg");
    expect(spinnerIcon).not.toBeNull();
    expect(spinnerIcon?.getAttribute("class")).toContain("animate-spin");
  });

  it("does NOT disable buttons for dates other than importingDate", () => {
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={vi.fn()}
        calendarConnected={true}
        importingDate={WED} // 2026-04-22
      />
    );

    const buttons = screen.getAllByTitle("Import today's meetings");
    // Wed is index 2 (Mon=0, Tue=1, Wed=2)
    expect(buttons[2]).toBeDisabled();
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
    expect(buttons[3]).not.toBeDisabled();
  });

  it("prevents re-clicking the disabled importing-date button", async () => {
    const onDayMeetingImportClick = vi.fn();
    renderWithQueryClient(
      <WeeklyCalendarGrid
        {...baseProps}
        onDayMeetingImportClick={onDayMeetingImportClick}
        calendarConnected={true}
        importingDate={MON}
      />
    );

    const buttons = screen.getAllByTitle("Import today's meetings");
    // buttons[0] is the Mon button and is disabled because importingDate === MON
    // userEvent respects the HTML disabled attribute and does not fire click events
    await userEvent.click(buttons[0]);
    expect(onDayMeetingImportClick).not.toHaveBeenCalled();
  });
});
