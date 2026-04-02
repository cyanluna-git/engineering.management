/**
 * WorkLogs Page
 * Main page for managing work time entries
 * Now with tabs: Entry (calendar view) and Table (list view)
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfWeek, addWeeks, addDays, subWeeks } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useApiError } from '@/hooks/useApiError';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { WeeklyCalendarGrid } from '@/components/worklogs/WeeklyCalendarGrid';
import { WorkLogEntryModal } from '@/components/worklogs/WorkLogEntryModal';
import { LeaveEntryModal } from '@/components/worklogs/LeaveEntryModal';
import { MeetingImportPreviewModal } from '@/components/worklogs/MeetingImportPreviewModal';
import { WorkLogTableView } from '@/components/worklogs/WorkLogTableView';
import { MyMonthlyRateCard, WorkLogMonthlyRateView } from '@/components/worklogs/WorkLogMonthlyRateView';
import { AIWorklogModal } from '@/components/worklogs/AIWorklogModal';
import {
    useWorklogs,
    useCreateWorklog,
    useUpdateWorklog,
    useDeleteWorklog,
    useCopyWeek,
    useCalendarConnectionStatus,
    useStartCalendarConnect,
    usePreviewMeetingImport,
    useCommitMeetingImport,
} from '@/hooks/useWorklogs';
import { useProjects } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import type { MeetingImportDraft } from '@/api/worklogs';
import type { WorkLog, WorkLogCreate, WorkLogUpdate } from '@/types';

export function WorkLogsPage() {
    const { user } = useAuth();
    const { t } = useTranslation('worklogs');
    const getErrorMessage = useApiError();
    const [activeTab, setActiveTab] = useState('entry');
    const [weekStart, setWeekStart] = useState(() =>
        startOfWeek(new Date(), { weekStartsOn: 1 }) // Monday
    );
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [editingWorklog, setEditingWorklog] = useState<WorkLog | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [selectedDateForAI, setSelectedDateForAI] = useState<Date | null>(null);
    const [movingWorklogId, setMovingWorklogId] = useState<number | null>(null);
    const [meetingImportItems, setMeetingImportItems] = useState<MeetingImportDraft[]>([]);
    const [meetingImportSkippedCount, setMeetingImportSkippedCount] = useState(0);
    const [isMeetingImportModalOpen, setIsMeetingImportModalOpen] = useState(false);
    const [calendarNotice, setCalendarNotice] = useState<string | null>(null);

    // Calculate week range for API query
    const weekRange = {
        start: format(weekStart, 'yyyy-MM-dd'),
        end: format(addWeeks(weekStart, 1), 'yyyy-MM-dd'),
    };

    // Fetch worklogs for the current week
    const { data: worklogs = [], isLoading, refetch } = useWorklogs({
        user_id: user?.id,
        start_date: weekRange.start,
        end_date: weekRange.end,
    });

    // Fetch projects for the modal
    const { data: projects = [] } = useProjects();

    // Mutations
    const createMutation = useCreateWorklog();
    const updateMutation = useUpdateWorklog();
    const deleteMutation = useDeleteWorklog();
    const copyWeekMutation = useCopyWeek();
    const calendarStatusQuery = useCalendarConnectionStatus();
    const { refetch: refetchCalendarStatus } = calendarStatusQuery;
    const startCalendarConnectMutation = useStartCalendarConnect();
    const previewMeetingImportMutation = usePreviewMeetingImport();
    const commitMeetingImportMutation = useCommitMeetingImport();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const calendarState = params.get('calendar');
        if (!calendarState) {
            return;
        }

        const noticeMap: Record<string, string> = {
            connected: t('meetingImport.notice.connected'),
            'account-mismatch': t('meetingImport.notice.accountMismatch'),
        };
        setCalendarNotice(noticeMap[calendarState] ?? t('errors.generic'));
        params.delete('calendar');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
        window.history.replaceState({}, document.title, nextUrl);
        refetchCalendarStatus();
    }, [refetchCalendarStatus, t]);

    // Navigation handlers
    const goToPreviousWeek = () => setWeekStart((prev: Date) => subWeeks(prev, 1));
    const goToNextWeek = () => setWeekStart((prev: Date) => addWeeks(prev, 1));
    const goToToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

    // Modal handlers
    const handleCellClick = (date: string) => {
        setSelectedDate(date);
        setEditingWorklog(null);
        setIsModalOpen(true);
    };

    const handleWorklogEdit = (worklog: WorkLog) => {
        setEditingWorklog(worklog);
        setSelectedDate(worklog.date.split('T')[0]);
        setIsModalOpen(true);
    };

    const handleWorklogDelete = async (worklogId: number) => {
        if (confirm(t('confirm.deleteWorklog'))) {
            await deleteMutation.mutateAsync(worklogId);
        }
    };

    const handleWorklogMove = async (worklog: WorkLog, targetDate: string) => {
        const sourceDate = worklog.date.split('T')[0];
        if (sourceDate === targetDate) {
            return;
        }

        setMovingWorklogId(worklog.id);
        try {
            await updateMutation.mutateAsync({
                id: worklog.id,
                data: { date: targetDate },
            });
        } catch (error: unknown) {
            alert(getErrorMessage(error));
        } finally {
            setMovingWorklogId(null);
        }
    };

    const handleAIInputClick = (date: string) => {
        setSelectedDateForAI(new Date(date));
        setIsAIModalOpen(true);
    };

    const handleModalSubmit = async (data: WorkLogCreate | WorkLogUpdate) => {
        try {
            if (editingWorklog) {
                await updateMutation.mutateAsync({
                    id: editingWorklog.id,
                    data: data as WorkLogUpdate
                });
            } else {
                await createMutation.mutateAsync(data as WorkLogCreate);
            }
            setIsModalOpen(false);
            setEditingWorklog(null);
            setSelectedDate(null);
        } catch (error: unknown) {
            alert(getErrorMessage(error));
        }
    };

    const handleCopyWeek = async () => {
        if (!user?.id) return;

        if (confirm(t('confirm.copyWeek'))) {
            try {
                await copyWeekMutation.mutateAsync({
                    user_id: user.id,
                    target_week_start: format(weekStart, 'yyyy-MM-dd'),
                });
                refetch();
            } catch (error: unknown) {
                alert(getErrorMessage(error));
            }
        }
    };

    const meetingImportWeekRange = useMemo(
        () => ({
            start_date: format(weekStart, 'yyyy-MM-dd'),
            end_date: format(addDays(weekStart, 6), 'yyyy-MM-dd'),
        }),
        [weekStart],
    );
    const meetingImportModalKey = useMemo(
        () => `${isMeetingImportModalOpen ? 'open' : 'closed'}:${meetingImportItems.map((item) => item.external_event_id).join('|')}`,
        [isMeetingImportModalOpen, meetingImportItems],
    );

    const handleCalendarConnect = async () => {
        try {
            const redirectUrl = `${window.location.origin}/worklogs`;
            const response = await startCalendarConnectMutation.mutateAsync(redirectUrl);
            window.location.assign(response.authorization_url);
        } catch (error: unknown) {
            alert(getErrorMessage(error));
        }
    };

    const handleMeetingImport = async () => {
        if (!calendarStatusQuery.data?.has_calendar_scope) {
            await handleCalendarConnect();
            return;
        }

        try {
            const response = await previewMeetingImportMutation.mutateAsync(meetingImportWeekRange);
            setMeetingImportItems(response.items);
            setMeetingImportSkippedCount(response.skipped_count);
            setIsMeetingImportModalOpen(true);
        } catch (error: unknown) {
            console.error('Meeting import preview failed', error);
            alert(getErrorMessage(error));
        }
    };

    const handleMeetingImportConfirm = async (selectedItems: MeetingImportDraft[]) => {
        try {
            const response = await commitMeetingImportMutation.mutateAsync({
                items: selectedItems.map((item) => ({
                    external_event_id: item.external_event_id,
                    date: item.date,
                    hours: item.hours,
                    description: item.description,
                    project_id: item.project_id ?? undefined,
                    work_type_category_id: item.work_type_category_id ?? undefined,
                    is_sudden_work: false,
                    is_business_trip: false,
                })),
            });

            setCalendarNotice(
                t('meetingImport.notice.imported', {
                    count: response.created.length,
                    skipped: response.skipped_existing,
                }),
            );
            setIsMeetingImportModalOpen(false);
            setMeetingImportItems([]);
            setMeetingImportSkippedCount(0);
            refetch();
        } catch (error: unknown) {
            console.error('Meeting import commit failed', error);
            alert(getErrorMessage(error));
        }
    };

    // Leave submit handler
    const handleLeaveSubmit = async (worklogs: WorkLogCreate[]) => {
        try {
            for (const worklog of worklogs) {
                await createMutation.mutateAsync(worklog);
            }
            setIsLeaveModalOpen(false);
            refetch();
        } catch (error: unknown) {
            alert(getErrorMessage(error));
        }
    };

    // Calculate week total
    const weekTotal = worklogs.reduce((sum, wl) => sum + wl.hours, 0);

    return (
        <div className="container mx-auto p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{t('title')}</h1>
                <div className="flex items-center gap-2">
                    {activeTab === 'entry' && (
                        <>
                            <Badge
                                variant={calendarStatusQuery.data?.has_calendar_scope ? 'default' : 'outline'}
                                className="hidden md:inline-flex"
                            >
                                {calendarStatusQuery.data?.has_calendar_scope
                                    ? t('meetingImport.status.connected')
                                    : t('meetingImport.status.notConnected')}
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleMeetingImport}
                                disabled={
                                    startCalendarConnectMutation.isPending ||
                                    previewMeetingImportMutation.isPending
                                }
                            >
                                {calendarStatusQuery.data?.has_calendar_scope
                                    ? `📥 ${t('buttons.meetingImport')}`
                                    : `🔗 ${t('buttons.connectCalendar')}`}
                            </Button>
                        </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setIsLeaveModalOpen(true)}>
                        🏖️ {t('buttons.registerLeave')}
                    </Button>
                    {activeTab === 'entry' && (
                        <Button variant="outline" size="sm" onClick={handleCopyWeek}>
                            📋 {t('buttons.copyLastWeek')}
                        </Button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center gap-3">
                    <TabsList>
                        <TabsTrigger value="entry">📅 {t('tabs.entry')}</TabsTrigger>
                        <TabsTrigger value="monthly-rate">📈 {t('tabs.monthlyRate')}</TabsTrigger>
                        <TabsTrigger value="table">📊 {t('tabs.table')}</TabsTrigger>
                    </TabsList>
                    <Link
                        to="/worklogs-table"
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                        📋 {t('tabs.advancedTable', 'Advanced Table')}
                    </Link>
                </div>

                {/* Entry Tab - Calendar View */}
                <TabsContent value="entry" className="space-y-4 mt-4">
                    {calendarNotice && (
                        <Alert>
                            <AlertDescription>{calendarNotice}</AlertDescription>
                        </Alert>
                    )}
                    <MyMonthlyRateCard />

                    {/* Week Navigation */}
                    <Card>
                        <CardHeader className="py-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setWeekStart(subWeeks(weekStart, 4))}>
                                        ⏪
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={goToPreviousWeek}>
                                        ◀
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={goToToday}>
                                        {t('buttons.today')}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={goToNextWeek}>
                                        ▶
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setWeekStart(addWeeks(weekStart, 4))}>
                                        ⏩
                                    </Button>
                                </div>

                                <CardTitle className="text-lg">
                                    {format(weekStart, 'yyyy-MM-dd')} ~ {format(addWeeks(weekStart, 1), 'yyyy-MM-dd')}
                                </CardTitle>

                                <div className="text-right">
                                    <span className="text-sm text-muted-foreground">{t('weekNavigation.weekTotal')} </span>
                                    <span className={`font-bold ${weekTotal > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                                        {weekTotal}h
                                    </span>
                                    <span className="text-sm text-muted-foreground"> {t('weekNavigation.targetHours')}</span>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>

                    {/* Calendar Grid */}
                    {isLoading ? (
                        <div className="text-center py-8">{t('status.loading')}</div>
                    ) : (
                        <WeeklyCalendarGrid
                            weekStart={weekStart}
                            worklogs={worklogs}
                            onCellClick={handleCellClick}
                            onWorklogEdit={handleWorklogEdit}
                            onWorklogDelete={handleWorklogDelete}
                            onWorklogMove={handleWorklogMove}
                            onAIInputClick={handleAIInputClick}
                            movingWorklogId={movingWorklogId}
                        />
                    )}
                </TabsContent>

                <TabsContent value="monthly-rate" className="mt-4">
                    <WorkLogMonthlyRateView />
                </TabsContent>

                {/* Table Tab */}
                <TabsContent value="table" className="mt-4">
                    <WorkLogTableView />
                </TabsContent>
            </Tabs>

            {/* Entry Modal */}
            <WorkLogEntryModal
                isOpen={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setEditingWorklog(null);
                    setSelectedDate(null);
                }}
                onSubmit={handleModalSubmit}
                date={selectedDate || ''}
                userId={user?.id || ''}
                projects={projects}
                initialData={editingWorklog ? {
                    project_id: editingWorklog.project_id,
                    work_type_category_id: editingWorklog.work_type_category_id,
                    hours: editingWorklog.hours,
                    description: editingWorklog.description || '',
                    is_sudden_work: editingWorklog.is_sudden_work,
                    is_business_trip: editingWorklog.is_business_trip,
                } : undefined}
                isEditing={!!editingWorklog}
                isLoading={createMutation.isPending || updateMutation.isPending}
            />

            {/* Leave Entry Modal */}
            <LeaveEntryModal
                isOpen={isLeaveModalOpen}
                onClose={() => setIsLeaveModalOpen(false)}
                onSubmit={handleLeaveSubmit}
                userId={user?.id || ''}
                isLoading={createMutation.isPending}
            />

            {/* AI Worklog Modal */}
            {selectedDateForAI && (
                <AIWorklogModal
                    isOpen={isAIModalOpen}
                    onClose={() => {
                        setIsAIModalOpen(false);
                        setSelectedDateForAI(null);
                    }}
                    targetDate={selectedDateForAI}
                    onComplete={refetch}
                />
            )}

            <MeetingImportPreviewModal
                key={meetingImportModalKey}
                isOpen={isMeetingImportModalOpen}
                items={meetingImportItems}
                skippedCount={meetingImportSkippedCount}
                isSubmitting={commitMeetingImportMutation.isPending}
                onClose={() => {
                    setIsMeetingImportModalOpen(false);
                    setMeetingImportItems([]);
                    setMeetingImportSkippedCount(0);
                }}
                onConfirm={handleMeetingImportConfirm}
            />
        </div>
    );
}

export default WorkLogsPage;
