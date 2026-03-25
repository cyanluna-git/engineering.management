import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, ComposedChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import { getGeneratedReport } from '@/api/client';
import type { GeneratedReport, GeneratedReportSection } from '@/types';

interface ReportDetailViewProps {
    reportId: string;
    onBack: () => void;
}

const RISK_COLORS: Record<string, { bg: string; text: string; emoji: string }> = {
    green: { bg: 'bg-green-500', text: 'text-green-100', emoji: '🟢' },
    yellow: { bg: 'bg-yellow-500', text: 'text-yellow-100', emoji: '🟡' },
    red: { bg: 'bg-red-500', text: 'text-red-100', emoji: '🔴' },
};

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function SectionCard({ title, section, children }: { title: string; section?: GeneratedReportSection; children?: React.ReactNode }) {
    if (!section) return null;
    const risk = RISK_COLORS[section.risk_level || 'green'] || RISK_COLORS.green;

    return (
        <Card className="print:break-inside-avoid">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{title}</CardTitle>
                    {section.risk_level && (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${risk.bg} ${risk.text}`}>
                            {risk.emoji} {section.risk_level.toUpperCase()}
                        </span>
                    )}
                </div>
                {section.headline && (
                    <p className="text-sm text-muted-foreground mt-1">{section.headline}</p>
                )}
            </CardHeader>
            <CardContent className="space-y-4">
                {children}
                {section.insights && section.insights.length > 0 && (
                    <div className="space-y-2">
                        {section.insights.map((insight, i) => (
                            <div key={i} className="flex gap-2 text-sm">
                                <span className="text-muted-foreground flex-shrink-0">•</span>
                                <span>{insight}</span>
                            </div>
                        ))}
                    </div>
                )}
                {section.recommendations && section.recommendations.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-3 mt-3">
                        <h4 className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">Recommendations</h4>
                        {section.recommendations.map((rec, i) => (
                            <div key={i} className="flex gap-2 text-sm text-blue-800">
                                <span className="flex-shrink-0">→</span>
                                <span>{rec}</span>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export function ReportDetailView({ reportId, onBack }: ReportDetailViewProps) {
    const { t } = useTranslation('reports');

    const { data: report, isLoading } = useQuery<GeneratedReport>({
        queryKey: ['generated-report', reportId],
        queryFn: () => getGeneratedReport(reportId),
    });

    if (isLoading) {
        return <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>;
    }

    if (!report || report.status === 'failed') {
        return (
            <div className="text-center py-12">
                <p className="text-red-500 mb-4">{report?.error_message || t('aiReport.loadFailed')}</p>
                <Button variant="outline" onClick={onBack}>{t('aiReport.backToList')}</Button>
            </div>
        );
    }

    const sections = report.sections || {};
    const charts = report.charts_data || {};

    // Build plan vs actual chart data
    const planVsActual = (() => {
        const planData = (charts.resource_monthly as Array<{ year: number; month: number; planned_fte: number }>) || [];
        const actualData = (charts.worklog_monthly as Array<{ year: number; month: number; actual_fte: number }>) || [];
        const merged: Record<string, { month: string; planned: number; actual: number }> = {};
        for (const p of planData) {
            const key = `${p.year}-${p.month}`;
            merged[key] = { month: `${MONTHS[p.month]}`, planned: p.planned_fte, actual: 0 };
        }
        for (const a of actualData) {
            const key = `${a.year}-${a.month}`;
            if (!merged[key]) merged[key] = { month: `${MONTHS[a.month]}`, planned: 0, actual: 0 };
            merged[key].actual = a.actual_fte;
        }
        return Object.values(merged).sort((a, b) => {
            const mA = MONTHS.indexOf(a.month);
            const mB = MONTHS.indexOf(b.month);
            return mA - mB;
        });
    })();

    const projectsData = (charts.projects as Array<{
        name: string; status: string; milestones_total: number; milestones_completed: number;
        delayed_milestones: Array<{ name: string; target: string }>;
    }>) || [];

    const capacityData = charts.capacity as { active_users?: number; allocated_users?: number; overloaded?: Array<{ name: string; fte: number }>; underutilized?: Array<{ name: string; fte: number }> } | undefined;

    return (
        <div className="space-y-6 print:space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between print:hidden">
                <Button variant="outline" size="sm" onClick={onBack}>← {t('aiReport.backToList')}</Button>
                <div className="text-sm text-muted-foreground">
                    {report.ai_model} · {report.created_at ? new Date(report.created_at).toLocaleString('ko-KR') : ''}
                </div>
            </div>

            {/* Title */}
            <div className="text-center">
                <h2 className="text-2xl font-bold">{report.title}</h2>
                <p className="text-muted-foreground mt-1">{report.period_start} ~ {report.period_end}</p>
            </div>

            {/* Executive Summary — dark card */}
            {sections.executive_summary && (
                <div className="bg-slate-800 text-white rounded-2xl p-6 print:bg-slate-100 print:text-slate-900">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-semibold">Executive Summary</h3>
                        {sections.executive_summary.health_status && (
                            <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                                RISK_COLORS[sections.executive_summary.health_status]?.bg || 'bg-gray-500'
                            } text-white`}>
                                {RISK_COLORS[sections.executive_summary.health_status]?.emoji} {sections.executive_summary.health_status?.toUpperCase()}
                            </span>
                        )}
                        {sections.executive_summary.risk_level && !sections.executive_summary.health_status && (
                            <span className={`text-sm px-3 py-1 rounded-full font-medium ${
                                RISK_COLORS[sections.executive_summary.risk_level]?.bg || 'bg-gray-500'
                            } text-white`}>
                                {RISK_COLORS[sections.executive_summary.risk_level]?.emoji} {sections.executive_summary.risk_level?.toUpperCase()}
                            </span>
                        )}
                    </div>
                    {sections.executive_summary.headline && (
                        <p className="text-lg font-medium mb-4 text-slate-100">{sections.executive_summary.headline}</p>
                    )}
                    {sections.executive_summary.insights?.map((insight, i) => (
                        <div key={i} className="flex gap-2 text-sm text-slate-300 mb-2">
                            <span className="flex-shrink-0 text-slate-500">•</span>
                            <span>{insight}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Resource Utilization + Chart */}
            <SectionCard title="Resource Utilization" section={sections.resource_utilization}>
                {planVsActual.length > 0 && (
                    <div className="h-64 print:h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={planVsActual}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="planned" name="Planned FTE" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="actual" name="Actual FTE" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </SectionCard>

            {/* Project Health */}
            <SectionCard title="Project Health" section={sections.project_health}>
                {projectsData.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {projectsData
                            .filter(p => p.milestones_total > 0)
                            .slice(0, 8)
                            .map((p, i) => {
                                const progress = p.milestones_total > 0 ? (p.milestones_completed / p.milestones_total) * 100 : 0;
                                const hasDelay = p.delayed_milestones?.length > 0;
                                return (
                                    <div key={i} className={`p-3 rounded-lg border ${hasDelay ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-medium text-sm truncate">{p.name}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                p.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                            }`}>{p.status}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                                            </div>
                                            <span className="text-xs text-muted-foreground">{p.milestones_completed}/{p.milestones_total}</span>
                                        </div>
                                        {hasDelay && (
                                            <div className="text-xs text-red-600 mt-1">
                                                Delayed: {p.delayed_milestones.map(d => d.name).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>
                )}
            </SectionCard>

            {/* Capacity Forecast */}
            <SectionCard title="Capacity Forecast" section={sections.capacity_forecast}>
                {capacityData && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="p-3 bg-slate-50 rounded-lg text-center">
                            <div className="text-2xl font-bold">{capacityData.active_users || 0}</div>
                            <div className="text-xs text-muted-foreground">Active Users</div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-lg text-center">
                            <div className="text-2xl font-bold">{capacityData.allocated_users || 0}</div>
                            <div className="text-xs text-muted-foreground">Allocated</div>
                        </div>
                        <div className="p-3 bg-red-50 rounded-lg text-center">
                            <div className="text-2xl font-bold text-red-600">{capacityData.overloaded?.length || 0}</div>
                            <div className="text-xs text-muted-foreground">Overloaded</div>
                        </div>
                        <div className="p-3 bg-yellow-50 rounded-lg text-center">
                            <div className="text-2xl font-bold text-yellow-600">{capacityData.underutilized?.length || 0}</div>
                            <div className="text-xs text-muted-foreground">Underutilized</div>
                        </div>
                    </div>
                )}
            </SectionCard>

            {/* Weekly Digest (only for weekly reports) */}
            {sections.weekly_digest && (
                <SectionCard title="Weekly Activity Digest" section={sections.weekly_digest} />
            )}
        </div>
    );
}
