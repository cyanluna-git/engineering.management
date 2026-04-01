/**
 * WorkLogs API Client
 */
import apiClient from './client';
import type {
    WorkLog,
    WorkLogCreate,
    WorkLogUpdate,
    DailySummary,
    CopyWeekRequest
} from '@/types';

export interface WorkLogListParams {
    user_id?: string;
    project_id?: string;
    start_date?: string;
    end_date?: string;
    work_type_category_id?: number;
    skip?: number;
    limit?: number;
}

/**
 * Get list of worklogs with optional filters
 */
export const getWorklogs = async (params: WorkLogListParams = {}): Promise<WorkLog[]> => {
    const response = await apiClient.get('/worklogs', { params });
    return response.data;
};

/**
 * Get a single worklog by ID
 */
export const getWorklog = async (id: number): Promise<WorkLog> => {
    const response = await apiClient.get(`/worklogs/${id}`);
    return response.data;
};

/**
 * Create a new worklog
 */
export const createWorklog = async (data: WorkLogCreate): Promise<WorkLog> => {
    const response = await apiClient.post('/worklogs', data);
    return response.data;
};

/**
 * Update an existing worklog
 */
export const updateWorklog = async (id: number, data: WorkLogUpdate): Promise<WorkLog> => {
    const response = await apiClient.put(`/worklogs/${id}`, data);
    return response.data;
};

/**
 * Delete a worklog
 */
export const deleteWorklog = async (id: number): Promise<void> => {
    await apiClient.delete(`/worklogs/${id}`);
};

/**
 * Copy worklogs from previous week to target week
 */
export const copyWeek = async (data: CopyWeekRequest): Promise<WorkLog[]> => {
    const response = await apiClient.post('/worklogs/copy-week', data);
    return response.data;
};

/**
 * Get daily summary for a user
 */
export const getDailySummary = async (userId: string, date: string): Promise<DailySummary> => {
    const response = await apiClient.get('/worklogs/summary/daily', {
        params: { user_id: userId, date }
    });
    return response.data;
};

/**
 * Frequent selections response
 */
export interface FrequentItem {
    id: string;
    label: string;
    count: number;
}

export interface FrequentSelections {
    work_types: FrequentItem[];
    projects: FrequentItem[];
}

/**
 * Get user's frequently used work types and projects
 */
export const getFrequentSelections = async (limit = 5, days = 90): Promise<FrequentSelections> => {
    const response = await apiClient.get('/worklogs/frequent', {
        params: { limit, days }
    });
    return response.data;
};

/**
 * WorkLog with user info for table display
 */
export interface WorkLogWithUser extends WorkLog {
    user_name?: string;
    user_korean_name?: string;
    department_name?: string;
}

export interface WorkLogTableParams extends WorkLogListParams {
    department_id?: string;
    sub_team_id?: string;
}

export interface MeetingImportDraft {
    external_source: string;
    external_event_id: string;
    subject: string;
    date: string;
    start_at: string;
    end_at: string;
    hours: number;
    description: string;
    location?: string | null;
    attendee_count: number;
    online_meeting: boolean;
    project_id?: string | null;
    project_code?: string | null;
    project_name?: string | null;
    work_type_category_id?: number | null;
    work_type_category_code?: string | null;
    work_type_category_name?: string | null;
    matched_project_keyword?: string | null;
    matched_work_type_keyword?: string | null;
    already_imported: boolean;
    existing_worklog_id?: number | null;
}

export interface MeetingImportPreviewRequest {
    start_date: string;
    end_date: string;
}

export interface MeetingImportPreviewResponse {
    items: MeetingImportDraft[];
    skipped_count: number;
}

export interface MeetingImportCommitItem {
    external_event_id: string;
    date: string;
    hours: number;
    description: string;
    project_id?: string | null;
    work_type_category_id?: number | null;
    is_sudden_work?: boolean;
    is_business_trip?: boolean;
}

export interface MeetingImportCommitRequest {
    items: MeetingImportCommitItem[];
}

export interface MeetingImportCommitResponse {
    created: WorkLog[];
    skipped_existing: number;
}

export interface MonthlyCompletionEntry {
    user_id: string;
    user_name: string;
    user_korean_name?: string;
    department_name?: string;
    sub_team_name?: string;
    completed_days: number;
    business_days: number;
    completion_rate: number;
}

export interface MonthlyCompletionResponse {
    month: string;
    business_days: number;
    entries: MonthlyCompletionEntry[];
}

export interface MonthlyCompletionParams {
    month: string;
    department_id?: string;
    sub_team_id?: string;
    user_id?: string;
    user_query?: string;
}

/**
 * Get worklogs for table view with user info
 * Admin: sees all worklogs
 * User: sees only their own worklogs
 */
export const getWorklogsTable = async (params: WorkLogTableParams = {}): Promise<WorkLogWithUser[]> => {
    const response = await apiClient.get('/worklogs/table', { params });
    return response.data;
};

export const getMonthlyCompletionRates = async (
    params: MonthlyCompletionParams
): Promise<MonthlyCompletionResponse> => {
    const response = await apiClient.get('/worklogs/completion/monthly', { params });
    return response.data;
};

export const previewMeetingImport = async (
    data: MeetingImportPreviewRequest,
): Promise<MeetingImportPreviewResponse> => {
    const response = await apiClient.post('/worklogs/meeting-import/preview', data);
    return response.data;
};

export const commitMeetingImport = async (
    data: MeetingImportCommitRequest,
): Promise<MeetingImportCommitResponse> => {
    const response = await apiClient.post('/worklogs/meeting-import/commit', data);
    return response.data;
};

/**
 * Download worklogs as CSV with the same filters as the table view
 */
export const downloadWorklogsCsv = async (params: WorkLogTableParams = {}): Promise<void> => {
    const response = await apiClient.get('/worklogs/export/csv', {
        params,
        responseType: 'blob',
    });
    const contentDisposition = response.headers['content-disposition'] as string | undefined;
    const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/i);
    const filename = filenameMatch?.[1] ?? `worklogs_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
    const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: 'text/csv;charset=utf-16le' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};
