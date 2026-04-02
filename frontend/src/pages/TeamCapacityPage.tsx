import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from 'recharts';
import { Users, Calendar, ChevronLeft, ChevronRight, TrendingUp, UserMinus, UserPlus, AlertCircle } from 'lucide-react';
import { AbsenceList } from '@/components/absences/AbsenceList';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { getDepartments, getSubTeams } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useTeamCapacity, useTeamMembers } from '@/hooks/useTeamCapacity';
import type { Department, SubTeam } from '@/api/client';
import type { TeamFTEMonth, TeamMemberAtDate } from '@/types';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(year: number, month: number): string {
    return `${MONTH_NAMES[month - 1]} ${year}`;
}

function TeamCapacityPage() {
    const { user } = useAuth();
    const userDepartmentId = user?.department_id ?? '';
    const userSubTeamId = user?.sub_team_id ?? '';
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    // Filter state
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | undefined>(undefined);
    const [selectedSubTeamId, setSelectedSubTeamId] = useState<string | undefined>(undefined);
    const [year, setYear] = useState(currentYear);

    // Selected month for member detail view
    const [selectedDetailMonth, setSelectedDetailMonth] = useState<{ year: number; month: number }>({
        year: currentYear,
        month: currentMonth,
    });

    // Fetch departments
    const { data: departments = [] } = useQuery<Department[], Error>({
        queryKey: ['departments'],
        queryFn: () => getDepartments(),
    });

    // Fetch sub-teams when department selected
    const defaultDepartmentId = useMemo(() => {
        if (!userDepartmentId) {
            return '';
        }

        return departments.some((department) => department.id === userDepartmentId)
            ? userDepartmentId
            : '';
    }, [departments, userDepartmentId]);

    const effectiveDepartmentId = selectedDepartmentId ?? defaultDepartmentId;

    const { data: subTeams = [] } = useQuery<SubTeam[], Error>({
        queryKey: ['sub-teams', effectiveDepartmentId],
        queryFn: () => getSubTeams(effectiveDepartmentId),
        enabled: !!effectiveDepartmentId,
    });

    const defaultSubTeamId = useMemo(() => {
        if (
            selectedDepartmentId !== undefined ||
            effectiveDepartmentId !== userDepartmentId ||
            !userSubTeamId
        ) {
            return '';
        }

        return subTeams.some((subTeam) => subTeam.id === userSubTeamId)
            ? userSubTeamId
            : '';
    }, [effectiveDepartmentId, selectedDepartmentId, subTeams, userDepartmentId, userSubTeamId]);

    const effectiveSubTeamId = selectedSubTeamId ?? defaultSubTeamId;

    // Fetch team capacity (12 months for selected year)
    const capacityParams = useMemo(() => ({
        department_id: effectiveDepartmentId,
        sub_team_id: effectiveSubTeamId || undefined,
        start_year: year,
        start_month: 1,
        end_year: year,
        end_month: 12,
    }), [effectiveDepartmentId, effectiveSubTeamId, year]);

    const {
        data: capacityData = [],
        isLoading: isCapacityLoading,
        error: capacityError,
    } = useTeamCapacity(capacityParams, { enabled: !!effectiveDepartmentId });

    // Fetch team members for selected detail month
    const memberParams = useMemo(() => ({
        department_id: effectiveDepartmentId,
        sub_team_id: effectiveSubTeamId || undefined,
        year: selectedDetailMonth.year,
        month: selectedDetailMonth.month,
    }), [effectiveDepartmentId, effectiveSubTeamId, selectedDetailMonth]);

    const {
        data: members = [],
        isLoading: isMembersLoading,
    } = useTeamMembers(memberParams, { enabled: !!effectiveDepartmentId });

    // Chart data
    const chartData = useMemo(() => {
        return capacityData.map((item: TeamFTEMonth) => ({
            name: formatMonthLabel(item.year, item.month),
            month: item.month,
            available_fte: item.available_fte,
            active_members: item.active_members,
            absence_impact: item.absence_impact,
            planned_hires: item.planned_hires,
        }));
    }, [capacityData]);

    // Summary stats for the year
    const summaryStats = useMemo(() => {
        if (capacityData.length === 0) return null;
        const currentMonthData = capacityData.find(
            (d: TeamFTEMonth) => d.year === currentYear && d.month === currentMonth
        ) || capacityData[0];
        const avgFte = capacityData.reduce((sum: number, d: TeamFTEMonth) => sum + d.available_fte, 0) / capacityData.length;
        const totalAbsenceImpact = capacityData.reduce((sum: number, d: TeamFTEMonth) => sum + d.absence_impact, 0);
        const totalPlannedHires = capacityData.reduce((sum: number, d: TeamFTEMonth) => sum + d.planned_hires, 0);
        return {
            currentMembers: currentMonthData?.active_members ?? 0,
            currentFte: currentMonthData?.available_fte ?? 0,
            avgFte: Math.round(avgFte * 10) / 10,
            totalAbsenceImpact: Math.round(totalAbsenceImpact * 10) / 10,
            totalPlannedHires,
        };
    }, [capacityData, currentYear, currentMonth]);

    const handleYearChange = (delta: number) => {
        setYear((prev) => prev + delta);
    };

    const handleDepartmentChange = (value: string) => {
        setSelectedDepartmentId(value);
        setSelectedSubTeamId('');
    };

    const handleSubTeamChange = (value: string) => {
        setSelectedSubTeamId(value === '__all__' ? '' : value);
    };

    const handleMonthCellClick = (monthItem: TeamFTEMonth) => {
        setSelectedDetailMonth({ year: monthItem.year, month: monthItem.month });
    };

    // Color coding for FTE cell
    const getFteCellStyle = (fte: number, activeMembers: number): string => {
        if (activeMembers === 0) return 'bg-slate-100 text-slate-400';
        const ratio = fte / activeMembers;
        if (ratio >= 0.9) return 'bg-green-100 text-green-800';
        if (ratio >= 0.7) return 'bg-amber-100 text-amber-800';
        return 'bg-orange-100 text-orange-800';
    };

    // Color coding for member status
    const getMemberStatusBadge = (member: TeamMemberAtDate) => {
        if (member.is_absent && member.absences.length > 0) {
            const absenceType = member.absences[0].absence_type;
            return (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200">
                    {absenceType.replace('_', ' ')}
                </Badge>
            );
        }
        return (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 border-green-200">
                Active
            </Badge>
        );
    };

    return (
        <div className="h-full flex flex-col gap-3 p-3">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Users className="w-5 h-5 text-blue-600" />
                        Team Capacity
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5 ml-7">
                        Monthly FTE availability and team member status
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Department selector */}
                    <Select value={effectiveDepartmentId} onValueChange={handleDepartmentChange}>
                        <SelectTrigger className="w-[200px] h-9 text-sm">
                            <SelectValue placeholder="Select Department" />
                        </SelectTrigger>
                        <SelectContent>
                            {departments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Sub-team selector */}
                    {subTeams.length > 0 && (
                        <Select value={effectiveSubTeamId || '__all__'} onValueChange={handleSubTeamChange}>
                            <SelectTrigger className="w-[180px] h-9 text-sm">
                                <SelectValue placeholder="All Sub-teams" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All Sub-teams</SelectItem>
                                {subTeams.map((st) => (
                                    <SelectItem key={st.id} value={st.id}>
                                        {st.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {/* Year navigation */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 p-0"
                            onClick={() => handleYearChange(-1)}
                        >
                            <ChevronLeft className="h-4 w-4 text-slate-600" />
                        </Button>
                        <span className="text-sm font-medium text-slate-700 min-w-[50px] text-center">
                            {year}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 p-0"
                            onClick={() => handleYearChange(1)}
                        >
                            <ChevronRight className="h-4 w-4 text-slate-600" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Prompt to select department */}
            {!effectiveDepartmentId && (
                <Card className="flex-1 flex items-center justify-center">
                    <CardContent className="text-center py-12">
                        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-lg font-medium text-slate-500">Select a department to view capacity</p>
                        <p className="text-sm text-slate-400 mt-1">Choose a department from the dropdown above</p>
                    </CardContent>
                </Card>
            )}

            {/* Main content */}
            {effectiveDepartmentId && (
                <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
                    <TabsList className="self-start">
                        <TabsTrigger value="overview">Capacity Overview</TabsTrigger>
                        <TabsTrigger value="members">Team Members</TabsTrigger>
                        <TabsTrigger value="absences">Absence Management</TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="flex-1 flex flex-col gap-3 min-h-0">
                        {/* Summary cards */}
                        {summaryStats && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <Card>
                                    <CardContent className="p-3">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                            <Users className="w-3.5 h-3.5" />
                                            Current Members
                                        </div>
                                        <p className="text-2xl font-bold text-slate-800">{summaryStats.currentMembers}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-3">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                            <TrendingUp className="w-3.5 h-3.5" />
                                            Current FTE
                                        </div>
                                        <p className="text-2xl font-bold text-blue-600">{summaryStats.currentFte}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-3">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            Avg FTE / Month
                                        </div>
                                        <p className="text-2xl font-bold text-slate-700">{summaryStats.avgFte}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-3">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                            <UserMinus className="w-3.5 h-3.5" />
                                            Absence Impact
                                        </div>
                                        <p className="text-2xl font-bold text-orange-600">{summaryStats.totalAbsenceImpact}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-3">
                                        <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
                                            <UserPlus className="w-3.5 h-3.5" />
                                            Planned Hires
                                        </div>
                                        <p className="text-2xl font-bold text-green-600">{summaryStats.totalPlannedHires}</p>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* FTE Grid Table */}
                        <Card className="flex-shrink-0">
                            <CardContent className="p-4">
                                <h2 className="text-sm font-semibold text-slate-700 mb-3">Monthly FTE Grid</h2>
                                {isCapacityLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                                    </div>
                                ) : capacityError ? (
                                    <div className="text-center py-8 text-red-500 text-sm">
                                        Failed to load capacity data
                                    </div>
                                ) : capacityData.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-sm">
                                        No capacity data available for {year}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left py-2 px-3 text-slate-500 font-medium w-32">Metric</th>
                                                    {capacityData.map((item: TeamFTEMonth) => (
                                                        <th
                                                            key={`${item.year}-${item.month}`}
                                                            className={cn(
                                                                'text-center py-2 px-2 text-slate-600 font-medium cursor-pointer hover:bg-slate-50 transition-colors min-w-[70px]',
                                                                item.year === selectedDetailMonth.year &&
                                                                item.month === selectedDetailMonth.month &&
                                                                'bg-blue-50 text-blue-700'
                                                            )}
                                                            onClick={() => handleMonthCellClick(item)}
                                                        >
                                                            {MONTH_NAMES[item.month - 1]}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* Active Members Row */}
                                                <tr className="border-b border-slate-100">
                                                    <td className="py-2 px-3 text-slate-600 font-medium">Active Members</td>
                                                    {capacityData.map((item: TeamFTEMonth) => (
                                                        <td key={`am-${item.month}`} className="text-center py-2 px-2 text-slate-700">
                                                            {item.active_members}
                                                        </td>
                                                    ))}
                                                </tr>
                                                {/* Absence Impact Row */}
                                                <tr className="border-b border-slate-100">
                                                    <td className="py-2 px-3 text-slate-600 font-medium">Absence Impact</td>
                                                    {capacityData.map((item: TeamFTEMonth) => (
                                                        <td
                                                            key={`ai-${item.month}`}
                                                            className={cn(
                                                                'text-center py-2 px-2',
                                                                item.absence_impact < 0 ? 'text-orange-600 font-medium' : 'text-slate-400'
                                                            )}
                                                        >
                                                            {item.absence_impact < 0 ? item.absence_impact : '0'}
                                                        </td>
                                                    ))}
                                                </tr>
                                                {/* Planned Hires Row */}
                                                <tr className="border-b border-slate-100">
                                                    <td className="py-2 px-3 text-slate-600 font-medium">Planned Hires</td>
                                                    {capacityData.map((item: TeamFTEMonth) => (
                                                        <td
                                                            key={`ph-${item.month}`}
                                                            className={cn(
                                                                'text-center py-2 px-2',
                                                                item.planned_hires > 0 ? 'text-green-600 font-medium' : 'text-slate-400'
                                                            )}
                                                        >
                                                            {item.planned_hires > 0 ? `+${item.planned_hires}` : '0'}
                                                        </td>
                                                    ))}
                                                </tr>
                                                {/* Available FTE Row (highlighted) */}
                                                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                                                    <td className="py-2.5 px-3 text-slate-800">Available FTE</td>
                                                    {capacityData.map((item: TeamFTEMonth) => (
                                                        <td key={`fte-${item.month}`} className="text-center py-2.5 px-2">
                                                            <span
                                                                className={cn(
                                                                    'inline-block px-2 py-0.5 rounded text-xs font-bold',
                                                                    getFteCellStyle(item.available_fte, item.active_members)
                                                                )}
                                                            >
                                                                {item.available_fte}
                                                            </span>
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* FTE Trend Chart */}
                        {chartData.length > 0 && (
                            <Card className="flex-1 min-h-[280px]">
                                <CardContent className="p-4 h-full flex flex-col">
                                    <h2 className="text-sm font-semibold text-slate-700 mb-3">FTE Trend ({year})</h2>
                                    <div className="flex-1 min-h-[220px] min-w-0">
                                        <ResponsiveContainer width="100%" height={220} minWidth={0}>
                                            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis
                                                    dataKey="name"
                                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                                    tickLine={false}
                                                />
                                                <YAxis
                                                    tick={{ fontSize: 11, fill: '#64748b' }}
                                                    tickLine={false}
                                                    axisLine={false}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        borderRadius: '8px',
                                                        border: '1px solid #e2e8f0',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                                        fontSize: 12,
                                                    }}
                                                />
                                                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                                                <Area
                                                    type="monotone"
                                                    dataKey="active_members"
                                                    name="Active Members"
                                                    stroke="#94a3b8"
                                                    fill="#e2e8f0"
                                                    strokeWidth={1.5}
                                                    fillOpacity={0.3}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="available_fte"
                                                    name="Available FTE"
                                                    stroke="#3b82f6"
                                                    fill="#93c5fd"
                                                    strokeWidth={2}
                                                    fillOpacity={0.4}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* Members Tab */}
                    <TabsContent value="members" className="flex-1 flex flex-col gap-3 min-h-0">
                        {/* Month selector for members view */}
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-sm font-semibold text-slate-700">
                                        Team Members - {formatMonthLabel(selectedDetailMonth.year, selectedDetailMonth.month)}
                                    </h2>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => {
                                                const date = new Date(selectedDetailMonth.year, selectedDetailMonth.month - 2, 1);
                                                setSelectedDetailMonth({
                                                    year: date.getFullYear(),
                                                    month: date.getMonth() + 1,
                                                });
                                            }}
                                        >
                                            <ChevronLeft className="h-3.5 w-3.5" />
                                        </Button>
                                        <span className="text-sm text-slate-600 min-w-[100px] text-center">
                                            {formatMonthLabel(selectedDetailMonth.year, selectedDetailMonth.month)}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8 w-8 p-0"
                                            onClick={() => {
                                                const date = new Date(selectedDetailMonth.year, selectedDetailMonth.month, 1);
                                                setSelectedDetailMonth({
                                                    year: date.getFullYear(),
                                                    month: date.getMonth() + 1,
                                                });
                                            }}
                                        >
                                            <ChevronRight className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>

                                {isMembersLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                                    </div>
                                ) : members.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-sm">
                                        No team members found for this period
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Name</th>
                                                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Email</th>
                                                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Sub-team</th>
                                                    <th className="text-left py-2 px-3 text-slate-500 font-medium">Position</th>
                                                    <th className="text-center py-2 px-3 text-slate-500 font-medium">Status</th>
                                                    <th className="text-center py-2 px-3 text-slate-500 font-medium">FTE Impact</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {members.map((member: TeamMemberAtDate) => (
                                                    <tr key={member.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                                                        <td className="py-2 px-3">
                                                            <div>
                                                                <span className="font-medium text-slate-800">{member.name}</span>
                                                                {member.korean_name && (
                                                                    <span className="text-slate-400 ml-1.5 text-xs">
                                                                        ({member.korean_name})
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-3 text-slate-500">{member.email}</td>
                                                        <td className="py-2 px-3 text-slate-600">{member.sub_team_name || '-'}</td>
                                                        <td className="py-2 px-3 text-slate-600">{member.position_name || '-'}</td>
                                                        <td className="py-2 px-3 text-center">{getMemberStatusBadge(member)}</td>
                                                        <td className="py-2 px-3 text-center">
                                                            {member.is_absent && member.absences.length > 0 ? (
                                                                <span className="text-orange-600 font-medium">
                                                                    -{member.absences.reduce((sum, a) => sum + a.fte_impact, 0)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-green-600">1.0</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {/* Member summary */}
                                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
                                            <span>
                                                Total: <strong className="text-slate-700">{members.length}</strong> members
                                            </span>
                                            <span>
                                                Active: <strong className="text-green-600">
                                                    {members.filter((m: TeamMemberAtDate) => !m.is_absent).length}
                                                </strong>
                                            </span>
                                            <span>
                                                On Leave: <strong className="text-orange-600">
                                                    {members.filter((m: TeamMemberAtDate) => m.is_absent).length}
                                                </strong>
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Absences Tab */}
                    <TabsContent value="absences" className="flex-1 flex flex-col gap-3 min-h-0">
                        <AbsenceList
                            departmentId={effectiveDepartmentId}
                            subTeamId={effectiveSubTeamId || undefined}
                        />
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

export default TeamCapacityPage;
