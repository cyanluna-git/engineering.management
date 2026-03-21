/**
 * Hooks for Team Capacity data fetching
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getTeamCapacity,
    getTeamMembers,
    getAbsences,
    createAbsence,
    updateAbsence,
    deleteAbsence,
} from '@/api/client';
import type { TeamFTEMonth, TeamMemberAtDate, Absence, AbsenceCreate, AbsenceUpdate } from '@/types';

// Query key factory
const teamCapacityKeys = {
    all: ['team-capacity'] as const,
    capacity: (params: {
        department_id: string;
        sub_team_id?: string;
        start_year: number;
        start_month: number;
        end_year: number;
        end_month: number;
    }) => [...teamCapacityKeys.all, 'capacity', params] as const,
    members: (params: {
        department_id: string;
        sub_team_id?: string;
        year: number;
        month: number;
    }) => [...teamCapacityKeys.all, 'members', params] as const,
};

const absenceKeys = {
    all: ['absences'] as const,
    list: (params?: {
        user_id?: string;
        department_id?: string;
        start_date?: string;
        end_date?: string;
    }) => [...absenceKeys.all, 'list', params] as const,
};

/**
 * Hook to fetch team capacity (FTE per month)
 */
export function useTeamCapacity(
    params: {
        department_id: string;
        sub_team_id?: string;
        start_year: number;
        start_month: number;
        end_year: number;
        end_month: number;
    },
    options?: { enabled?: boolean }
) {
    return useQuery<TeamFTEMonth[], Error>({
        queryKey: teamCapacityKeys.capacity(params),
        queryFn: () => getTeamCapacity(params),
        enabled: options?.enabled ?? !!params.department_id,
    });
}

/**
 * Hook to fetch team members at a specific month
 */
export function useTeamMembers(
    params: {
        department_id: string;
        sub_team_id?: string;
        year: number;
        month: number;
    },
    options?: { enabled?: boolean }
) {
    return useQuery<TeamMemberAtDate[], Error>({
        queryKey: teamCapacityKeys.members(params),
        queryFn: () => getTeamMembers(params),
        enabled: options?.enabled ?? !!params.department_id,
    });
}

/**
 * Hook to fetch absences with filters
 */
export function useAbsences(
    params?: {
        user_id?: string;
        department_id?: string;
        start_date?: string;
        end_date?: string;
    },
    options?: { enabled?: boolean }
) {
    return useQuery<Absence[], Error>({
        queryKey: absenceKeys.list(params),
        queryFn: () => getAbsences(params),
        enabled: options?.enabled,
    });
}

/**
 * Hook to create an absence
 */
export function useCreateAbsence() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data: AbsenceCreate) => createAbsence(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: absenceKeys.all });
            queryClient.invalidateQueries({ queryKey: teamCapacityKeys.all });
        },
    });
}

/**
 * Hook to update an absence
 */
export function useUpdateAbsence() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: AbsenceUpdate }) =>
            updateAbsence(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: absenceKeys.all });
            queryClient.invalidateQueries({ queryKey: teamCapacityKeys.all });
        },
    });
}

/**
 * Hook to delete an absence
 */
export function useDeleteAbsence() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteAbsence(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: absenceKeys.all });
            queryClient.invalidateQueries({ queryKey: teamCapacityKeys.all });
        },
    });
}
