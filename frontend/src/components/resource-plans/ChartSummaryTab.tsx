import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { ProjectSummary, WorklogProjectSummary } from '@/api/client';

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
];

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface ChartSummaryTabProps {
  selectedYear: number;
  projectSummary: ProjectSummary[];
  worklogSummary: WorklogProjectSummary[];
}

export function ChartSummaryTab({ selectedYear, projectSummary, worklogSummary }: ChartSummaryTabProps) {
  const { t } = useTranslation('resource-plans');

  // Identify top 8 projects by total planned FTE for the year
  const topProjects = useMemo(() => {
    const planByProject = new Map<string, { id: string; name: string; total: number }>();
    for (const row of projectSummary) {
      if (row.year !== selectedYear) continue;
      const existing = planByProject.get(row.project_id) ?? { id: row.project_id, name: row.project_name, total: 0 };
      existing.total += row.total_hours;
      planByProject.set(row.project_id, existing);
    }
    return Array.from(planByProject.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [projectSummary, selectedYear]);

  const topProjectIds = useMemo(() => new Set(topProjects.map(p => p.id)), [topProjects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const effectiveProjectId = selectedProjectId || topProjects[0]?.id || '';

  // Chart 1: Monthly stacked area (plan by project) + actual line
  const monthlyStackedData = useMemo(() => {
    const data: Record<number, Record<string, number>> = {};
    for (let m = 1; m <= 12; m++) data[m] = { month: m };

    for (const row of projectSummary) {
      if (row.year !== selectedYear) continue;
      const key = topProjectIds.has(row.project_id) ? row.project_id : '__other';
      data[row.month][key] = (data[row.month][key] || 0) + row.total_hours;
    }

    // Actual totals per month
    for (const row of worklogSummary) {
      if (row.year !== selectedYear) continue;
      data[row.month]['actual'] = (data[row.month]['actual'] || 0) + row.total_fte;
    }

    return Object.values(data).map(d => ({
      ...d,
      name: MONTHS[d.month as number],
    }));
  }, [projectSummary, worklogSummary, selectedYear, topProjectIds]);

  // Chart 2: Project comparison bars (annual sum)
  const projectComparisonData = useMemo(() => {
    const planMap = new Map<string, { name: string; plan: number; actual: number }>();

    for (const p of topProjects) {
      planMap.set(p.id, { name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name, plan: 0, actual: 0 });
    }

    for (const row of projectSummary) {
      if (row.year !== selectedYear || !planMap.has(row.project_id)) continue;
      planMap.get(row.project_id)!.plan += row.total_hours;
    }

    for (const row of worklogSummary) {
      if (row.year !== selectedYear || !planMap.has(row.project_id)) continue;
      planMap.get(row.project_id)!.actual += row.total_fte;
    }

    return Array.from(planMap.values())
      .map(d => ({ ...d, plan: round(d.plan, 1), actual: round(d.actual, 1) }))
      .sort((a, b) => b.plan - a.plan);
  }, [topProjects, projectSummary, worklogSummary, selectedYear]);

  // Chart 3: Single project trend
  const projectTrendData = useMemo(() => {
    if (!effectiveProjectId) return [];
    const data: { name: string; plan: number; actual: number }[] = [];

    for (let m = 1; m <= 12; m++) {
      let plan = 0;
      let actual = 0;

      for (const row of projectSummary) {
        if (row.year === selectedYear && row.month === m && row.project_id === effectiveProjectId) {
          plan += row.total_hours;
        }
      }
      for (const row of worklogSummary) {
        if (row.year === selectedYear && row.month === m && row.project_id === effectiveProjectId) {
          actual += row.total_fte;
        }
      }

      data.push({ name: MONTHS[m], plan: round(plan, 2), actual: round(actual, 2) });
    }
    return data;
  }, [effectiveProjectId, projectSummary, worklogSummary, selectedYear]);

  const selectedProjectName = topProjects.find(p => p.id === effectiveProjectId)?.name ?? '';

  // Legend for stacked area: project names
  const areaLegendItems = useMemo(() => {
    const items = topProjects.map((p, i) => ({
      id: p.id,
      name: p.name.length > 15 ? p.name.slice(0, 13) + '…' : p.name,
      color: COLORS[i % COLORS.length],
    }));
    // Check if there's "other" data
    const hasOther = monthlyStackedData.some(d => (d as unknown as Record<string, number>)['__other'] > 0);
    if (hasOther) {
      items.push({ id: '__other', name: t('chart.other'), color: '#94a3b8' });
    }
    return items;
  }, [topProjects, monthlyStackedData, t]);

  return (
    <div className="space-y-6">
      {/* Chart 1: Monthly Total FTE (Stacked Area + Actual Line) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('chart.monthlyTotalFte')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthlyStackedData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {areaLegendItems.map((item) => (
                <Area
                  key={item.id}
                  type="monotone"
                  dataKey={item.id}
                  name={item.name}
                  stackId="plan"
                  fill={item.color}
                  stroke={item.color}
                  fillOpacity={0.6}
                />
              ))}
              <Line
                type="monotone"
                dataKey="actual"
                name={t('chart.actualFte')}
                stroke="#1e293b"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#1e293b' }}
                strokeDasharray="none"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bottom row: 2 charts side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Chart 2: Project Comparison (Grouped Bar) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('chart.projectComparison')}</CardTitle>
          </CardHeader>
          <CardContent>
            {projectComparisonData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('chart.noData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={projectComparisonData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="plan" name={t('chart.planFte')} fill="#93c5fd" radius={[0, 4, 4, 0]} barSize={12} />
                  <Bar dataKey="actual" name={t('chart.actualFte')} fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Chart 3: Project Trend (Line) */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{t('chart.projectTrend')}</CardTitle>
              <select
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                value={effectiveProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {topProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            {projectTrendData.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t('chart.noData')}</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={projectTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="plan"
                    name={`${selectedProjectName} Plan`}
                    stroke="#93c5fd"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name={`${selectedProjectName} Actual`}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
