import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
    ComposedChart,
    Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { getCapacitySummary, getWorklogSummary, CapacitySummary, WorklogSummary } from '@/api/client';
import { ReportListView } from '@/components/reports/ReportListView';
import { ReportDetailView } from '@/components/reports/ReportDetailView';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899'];
const STACK_COLORS = { PRODUCT: '#3b82f6', FUNCTIONAL: '#f59e0b', SUPPORT: '#10b981' };

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ReportsPage: React.FC = () => {
    const { t } = useTranslation('reports');
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [activeTab, setActiveTab] = useState<'capacity' | 'worklog' | 'ai-report'>('capacity');
    const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

    const { data: capacityData, isLoading: capacityLoading } = useQuery<CapacitySummary>({
        queryKey: ['reports', 'capacity', selectedYear],
        queryFn: () => getCapacitySummary(selectedYear),
    });

    const { data: worklogData, isLoading: worklogLoading } = useQuery<WorklogSummary>({
        queryKey: ['reports', 'worklog', selectedYear],
        queryFn: () => getWorklogSummary(selectedYear),
    });

    // Plan vs Actual monthly data
    const planVsActual = capacityData?.monthly.map(m => ({
        name: MONTHS[m.month],
        planned: m.total_fte,
        actual: (m as Record<string, unknown>).actual_fte as number || 0,
    })) || [];

    // Worklog monthly with FTE line
    const worklogMonthly = worklogData?.monthly.map(m => ({
        name: MONTHS[m.month],
        hours: m.total_hours,
        fte: (m as Record<string, unknown>).total_fte as number || round(m.total_hours / 160, 1),
    })) || [];

    // Category stacked data
    const categoryData = ((worklogData as unknown as Record<string, unknown>)?.by_category as Array<Record<string, unknown>>) || [];
    const categoryMonthly = categoryData.map((c) => ({
        name: MONTHS[(c.month as number) || 0],
        Product: c.PRODUCT as number || 0,
        Functional: c.FUNCTIONAL as number || 0,
        Support: c.SUPPORT as number || 0,
    }));

    // Project Role pie data
    const byProjectRole = ((capacityData as unknown as Record<string, unknown>)?.by_project_role as Array<{ name: string; total_fte: number }>) || [];

    // Top projects with monthly average
    const monthCount = capacityData?.monthly.length || 1;
    const projectsWithAvg = capacityData?.by_project.map(p => ({
        ...p,
        avg_fte: round(p.total_fte / Math.max(monthCount, 1), 1),
    })) || [];

    return (
        <div className="container mx-auto p-4 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold">{t('title')}</h1>
                <select
                    className="border rounded px-3 py-2"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                        <option key={y} value={y}>{t('yearSelector', { year: y })}</option>
                    ))}
                </select>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
                {(['capacity', 'worklog', 'ai-report'] as const).map(tab => (
                    <button
                        key={tab}
                        className={`px-4 py-2 -mb-px ${activeTab === tab
                            ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                            : 'text-muted-foreground'}`}
                        onClick={() => { setActiveTab(tab); if (tab === 'ai-report') setSelectedReportId(null); }}
                    >
                        {t(`tabs.${tab === 'ai-report' ? 'aiReport' : tab}`)}
                    </button>
                ))}
            </div>

            {/* ═══════════ Capacity Tab: Plan vs Actual ═══════════ */}
            {activeTab === 'capacity' && (
                <div className="space-y-6">
                    {capacityLoading ? (
                        <div className="text-center py-12">{t('status.loading')}</div>
                    ) : (
                        <>
                            {/* Plan vs Actual Bar Chart */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('capacity.planVsActual')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {planVsActual.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">{t('capacity.noDataYear', { year: selectedYear })}</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <ComposedChart data={planVsActual}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis />
                                                <Tooltip />
                                                <Legend />
                                                <Bar dataKey="planned" name="Planned FTE" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="actual" name="Actual FTE" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Project Role Pie */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>{t('capacity.byProjectRole')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {byProjectRole.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">{t('capacity.noData')}</div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height={280}>
                                                <PieChart>
                                                    <Pie
                                                        data={byProjectRole}
                                                        dataKey="total_fte"
                                                        nameKey="name"
                                                        cx="50%"
                                                        cy="50%"
                                                        outerRadius={90}
                                                        label={({ name, percent }: { name?: string; percent?: number }) =>
                                                            `${name} ${((percent || 0) * 100).toFixed(0)}%`
                                                        }
                                                    >
                                                        {byProjectRole.map((_, i) => (
                                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Top Projects with monthly avg */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>{t('capacity.byProjectTop10')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {projectsWithAvg.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">{t('capacity.noData')}</div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b text-muted-foreground">
                                                        <th className="text-left py-2">{t('capacity.project')}</th>
                                                        <th className="text-right py-2">{t('capacity.totalFte')}</th>
                                                        <th className="text-right py-2">{t('capacity.avgFte')}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {projectsWithAvg.map((p, i) => (
                                                        <tr key={i} className="border-b hover:bg-slate-50">
                                                            <td className="py-2">{p.code ? `${p.code} - ` : ''}{p.name}</td>
                                                            <td className="text-right py-2">{p.total_fte.toFixed(1)}</td>
                                                            <td className="text-right py-2 font-medium">{p.avg_fte}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ═══════════ WorkLog Tab ═══════════ */}
            {activeTab === 'worklog' && (
                <div className="space-y-6">
                    {worklogLoading ? (
                        <div className="text-center py-12">{t('status.loading')}</div>
                    ) : (
                        <>
                            {/* Monthly Hours + FTE Line */}
                            <Card>
                                <CardHeader>
                                    <CardTitle>{t('worklog.monthlyHours')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {worklogMonthly.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground">{t('worklog.noDataYear', { year: selectedYear })}</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <ComposedChart data={worklogMonthly}>
                                                <CartesianGrid strokeDasharray="3 3" />
                                                <XAxis dataKey="name" />
                                                <YAxis yAxisId="left" />
                                                <YAxis yAxisId="right" orientation="right" />
                                                <Tooltip />
                                                <Legend />
                                                <Bar yAxisId="left" dataKey="hours" name={t('chart.hours')} fill="#10b981" radius={[4, 4, 0, 0]} />
                                                <Line yAxisId="right" type="monotone" dataKey="fte" name="FTE" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    )}
                                </CardContent>
                            </Card>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Category Stacked Bar */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>{t('worklog.byCategory')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {categoryMonthly.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">{t('worklog.noData')}</div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height={280}>
                                                <ComposedChart data={categoryMonthly}>
                                                    <CartesianGrid strokeDasharray="3 3" />
                                                    <XAxis dataKey="name" />
                                                    <YAxis />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Bar dataKey="Product" stackId="cat" fill={STACK_COLORS.PRODUCT} />
                                                    <Bar dataKey="Functional" stackId="cat" fill={STACK_COLORS.FUNCTIONAL} />
                                                    <Bar dataKey="Support" stackId="cat" fill={STACK_COLORS.SUPPORT} radius={[4, 4, 0, 0]} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Top Projects */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>{t('worklog.byProjectTop10')}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {(worklogData?.by_project.length || 0) === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">{t('worklog.noData')}</div>
                                        ) : (
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b text-muted-foreground">
                                                        <th className="text-left py-2">{t('worklog.project')}</th>
                                                        <th className="text-right py-2">{t('worklog.hours')}</th>
                                                        <th className="text-right py-2">FTE</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {worklogData?.by_project.map((p, i) => (
                                                        <tr key={i} className="border-b hover:bg-slate-50">
                                                            <td className="py-2">{p.code ? `${p.code} - ` : ''}{p.name}</td>
                                                            <td className="text-right py-2">{p.total_hours.toFixed(0)}h</td>
                                                            <td className="text-right py-2 font-medium">{(p.total_hours / 160).toFixed(1)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ═══════════ AI Report Tab ═══════════ */}
            {activeTab === 'ai-report' && (
                selectedReportId ? (
                    <ReportDetailView reportId={selectedReportId} onBack={() => setSelectedReportId(null)} />
                ) : (
                    <ReportListView onSelectReport={setSelectedReportId} />
                )
            )}
        </div>
    );
};

function round(n: number, d: number): number {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
}

export default ReportsPage;
