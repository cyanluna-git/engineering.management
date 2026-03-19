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

