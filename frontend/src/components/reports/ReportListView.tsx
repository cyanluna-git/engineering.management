import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent } from '@/components/ui';
import { getGeneratedReports, generateAIReport } from '@/api/client';
import { usePermissions } from '@/hooks/usePermissions';
import type { GeneratedReport } from '@/types';

interface ReportListViewProps {
    onSelectReport: (id: string) => void;
}

const TYPE_BADGE: Record<string, { bg: string; label: string }> = {
    weekly: { bg: 'bg-blue-100 text-blue-700', label: 'Weekly' },
    monthly: { bg: 'bg-purple-100 text-purple-700', label: 'Monthly' },
};

const STATUS_BADGE: Record<string, { bg: string; label: string }> = {
    published: { bg: 'bg-green-100 text-green-700', label: 'Published' },
    generating: { bg: 'bg-yellow-100 text-yellow-700', label: 'Generating...' },
    failed: { bg: 'bg-red-100 text-red-700', label: 'Failed' },
};

export function ReportListView({ onSelectReport }: ReportListViewProps) {
    const { t } = useTranslation('reports');
    const { canViewReports } = usePermissions();
    const queryClient = useQueryClient();
    const [typeFilter, setTypeFilter] = useState<string>('');

    const { data: reports = [], isLoading } = useQuery<GeneratedReport[]>({
        queryKey: ['generated-reports', typeFilter],
        queryFn: () => getGeneratedReports(typeFilter || undefined),
    });

    const generateMutation = useMutation({
        mutationFn: generateAIReport,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['generated-reports'] });
        },
    });

    const handleGenerate = (reportType: string) => {
        generateMutation.mutate({ report_type: reportType });
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {['', 'weekly', 'monthly'].map(type => (
                        <button
                            key={type}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                                typeFilter === type
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                            }`}
                            onClick={() => setTypeFilter(type)}
                        >
                            {type === '' ? t('aiReport.filterAll') : type === 'weekly' ? t('aiReport.weekly') : t('aiReport.monthly')}
                        </button>
                    ))}
                </div>

                {canViewReports && (
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleGenerate('weekly')}
                            disabled={generateMutation.isPending}
                        >
                            {t('aiReport.generateWeekly')}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => handleGenerate('monthly')}
                            disabled={generateMutation.isPending}
                        >
                            {generateMutation.isPending ? t('aiReport.generating') : t('aiReport.generateMonthly')}
                        </Button>
                    </div>
                )}
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
            )}

            {/* Empty */}
            {!isLoading && reports.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                    {t('aiReport.noReports')}
                </div>
            )}

            {/* Report cards */}
            <div className="grid gap-3">
                {reports.map(report => {
                    const typeBadge = TYPE_BADGE[report.report_type] || TYPE_BADGE.monthly;
                    const statusBadge = STATUS_BADGE[report.status] || STATUS_BADGE.published;

                    return (
                        <Card
                            key={report.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => report.status === 'published' && onSelectReport(report.id)}
                        >
                            <CardContent className="py-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge.bg}`}>
                                            {typeBadge.label}
                                        </span>
                                        <span className="font-semibold">{report.title}</span>
                                        <span className="text-sm text-muted-foreground">
                                            {report.period_start} ~ {report.period_end}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge.bg}`}>
                                            {statusBadge.label}
                                        </span>
                                        {report.ai_model && (
                                            <span className="text-xs text-muted-foreground">{report.ai_model}</span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {report.created_at ? new Date(report.created_at).toLocaleDateString('ko-KR') : ''}
                                        </span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
