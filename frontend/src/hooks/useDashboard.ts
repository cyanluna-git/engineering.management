/**
 * Hook for Dashboard data
 */
import { useQuery } from '@tanstack/react-query';
import {
    getMyDashboard,
    DashboardData,
    getTeamDashboard,
    TeamDashboardData,
    TeamDashboardScope,
    DashboardViewMode,
    getMyFTE,
    MyFTEResponse,
    getProjectAISummary,
    getProjectAISummaryHistory,
    TeamAISummary,
    AISummaryHistoryItem,
} from '@/api/client';

export function useDashboard(userId?: string) {
    return useQuery<DashboardData, Error>({
        queryKey: ['dashboard', 'my-summary', userId],
        queryFn: () => getMyDashboard(userId),
    });
}

export function useTeamDashboard(
    scope: TeamDashboardScope = 'department',
    viewMode: DashboardViewMode = 'weekly',
    dateRange?: { start: string; end: string },
    enabled: boolean = true,
    orgId?: string,
) {
    return useQuery<TeamDashboardData, Error>({
        queryKey: ['dashboard', 'team-summary', scope, viewMode, dateRange?.start, dateRange?.end, orgId],
        queryFn: () => getTeamDashboard(scope, viewMode, dateRange, orgId),
        enabled,
    });
}

export function useMyFTE(year: number, month: number, enabled: boolean = true, userId?: string) {
    return useQuery<MyFTEResponse, Error>({
        queryKey: ['dashboard', 'my-fte', year, month, userId],
        queryFn: () => getMyFTE(year, month, userId),
        enabled: enabled && !!year && !!month,
    });
}

export function useProjectAISummary(
    projectId: string,
    period: 'weekly' | 'monthly' = 'weekly',
    enabled: boolean = true,
) {
    return useQuery<TeamAISummary, Error>({
        queryKey: ['ai-summary', 'project', projectId, period],
        queryFn: () => getProjectAISummary(projectId, period, false),
        enabled: enabled && !!projectId,
        staleTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
    });
}

export function useProjectAISummaryHistory(
    projectId: string,
    enabled: boolean = false,
) {
    return useQuery<AISummaryHistoryItem[], Error>({
        queryKey: ['ai-summary-history', 'project', projectId],
        queryFn: () => getProjectAISummaryHistory(projectId, 10),
        enabled: enabled && !!projectId,
    });
}

