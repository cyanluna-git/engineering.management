import { useState, useMemo } from 'react';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  User,
  CalendarDays,
  ChevronsUpDown,
  FileText,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { getWeeklyReportHierarchy } from '@/api/client';
import type { WeeklyReportHierarchy, WeeklyReportHierarchySubTeam } from '@/api/client';
import { WeeklyReportMarkdown } from '@/components/dashboard/weekly-report-markdown';

function getMonday(d: Date): Date {
  return startOfWeek(d, { weekStartsOn: 1 });
}

function SubmissionBadge({ submitted, total }: { submitted: number; total: number }) {
  const ratio = total > 0 ? submitted / total : 0;
  const variant = ratio >= 1 ? 'default' : ratio >= 0.5 ? 'secondary' : 'destructive';
  return (
    <Badge variant={variant} className="text-xs font-normal">
      {submitted}/{total}명 제출
    </Badge>
  );
}

function MemberRow({
  name,
  koreanName,
  report,
  isExpanded,
  onToggle,
}: {
  name: string;
  koreanName: string | null;
  report: { markdown_body: string; updated_at: string; status: string } | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const displayName = koreanName || name;
  const hasReport = report && report.markdown_body.trim().length > 0;

  return (
    <div className="border-t border-slate-100">
      <button
        onClick={onToggle}
        disabled={!hasReport}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
      >
        {hasReport ? (
          isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        ) : (
          <User className="h-3.5 w-3.5 text-slate-300 shrink-0" />
        )}
        <span className={hasReport ? 'text-slate-700' : 'text-slate-400'}>{displayName}</span>
        <span className="ml-auto flex items-center gap-2 text-xs">
          {hasReport ? (
            <>
              <Badge variant="outline" className="text-xs font-normal text-green-600 border-green-200">저장됨</Badge>
              <span className="text-slate-400">{report.updated_at?.slice(0, 10)}</span>
            </>
          ) : (
            <Badge variant="outline" className="text-xs font-normal text-slate-400 border-slate-200">미작성</Badge>
          )}
        </span>
      </button>
      {isExpanded && hasReport && (
        <div className="px-6 pb-3 pt-1">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <WeeklyReportMarkdown value={report.markdown_body} emptyMessage="내용 없음" compact />
          </div>
        </div>
      )}
    </div>
  );
}

function SubTeamSection({
  subTeam,
  isExpanded,
  onToggle,
  expandedMembers,
  onToggleMember,
}: {
  subTeam: WeeklyReportHierarchySubTeam;
  isExpanded: boolean;
  onToggle: () => void;
  expandedMembers: Set<string>;
  onToggleMember: (userId: string) => void;
}) {
  const hasTeamReport = subTeam.report && subTeam.report.markdown_body?.trim().length > 0;

  return (
    <Card className="overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0 transition-transform" />
        )}
        <Users className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="font-medium text-slate-700">{subTeam.name}</span>
        <SubmissionBadge submitted={subTeam.submitted_count} total={subTeam.total_count} />
      </button>

      {isExpanded && (
        <div>
          {hasTeamReport && (
            <div className="border-t border-slate-200 px-4 py-3 bg-blue-50/30">
              <div className="text-xs font-medium text-blue-600 mb-2 flex items-center gap-1">
                <FileText className="h-3 w-3" /> 팀 요약
              </div>
              <WeeklyReportMarkdown value={subTeam.report!.markdown_body} emptyMessage="" compact />
            </div>
          )}
          <div>
            {subTeam.members.map((member) => (
              <MemberRow
                key={member.user_id}
                name={member.name}
                koreanName={member.korean_name}
                report={member.report as { markdown_body: string; updated_at: string; status: string } | null}
                isExpanded={expandedMembers.has(member.user_id)}
                onToggle={() => onToggleMember(member.user_id)}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export function WeeklyReportHierarchyPage() {
  const { user } = useAuth();
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [expandedSubTeams, setExpandedSubTeams] = useState<Set<string>>(new Set());
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  const monday = useMemo(() => getMonday(referenceDate), [referenceDate]);
  const dateKey = format(monday, 'yyyy-MM-dd');

  const departmentId = user?.department_id;

  const { data, isLoading, error } = useQuery<WeeklyReportHierarchy>({
    queryKey: ['weekly-report-hierarchy', departmentId, dateKey],
    queryFn: () => getWeeklyReportHierarchy(departmentId!, dateKey),
    enabled: !!departmentId,
  });

  const toggleSubTeam = (id: string) => {
    setExpandedSubTeams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMember = (userId: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    const allSubTeamIds = data.sub_teams.map((st) => st.id ?? 'unassigned');
    const allMemberIds = data.sub_teams.flatMap((st) => st.members.map((m) => m.user_id));
    const allExpanded = allSubTeamIds.every((id) => expandedSubTeams.has(id));
    if (allExpanded) {
      setExpandedSubTeams(new Set());
      setExpandedMembers(new Set());
    } else {
      setExpandedSubTeams(new Set(allSubTeamIds));
      setExpandedMembers(new Set(allMemberIds));
    }
  };

  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    if (!data) return;
    // Expand all before printing
    const allSubTeamIds = data.sub_teams.map((st) => st.id ?? 'unassigned');
    const allMemberIds = data.sub_teams.flatMap((st) => st.members.map((m) => m.user_id));
    setExpandedSubTeams(new Set(allSubTeamIds));
    setExpandedMembers(new Set(allMemberIds));
    setTimeout(() => window.print(), 300);
  };

  const handleCopyMarkdown = () => {
    if (!data) return;
    const lines: string[] = [];
    lines.push(`# ${data.department.name} 주간 보고서 (${data.week_start} ~ ${data.week_end})`);
    if (data.department_report?.markdown_body?.trim()) {
      lines.push('', data.department_report.markdown_body.trim());
    }
    for (const st of data.sub_teams) {
      lines.push('', `## ${st.name} (${st.submitted_count}/${st.total_count}명 제출)`);
      if (st.report?.markdown_body?.trim()) {
        lines.push('', st.report.markdown_body.trim());
      }
      for (const m of st.members) {
        const name = m.korean_name || m.name;
        if (m.report?.markdown_body?.trim()) {
          lines.push('', `### ${name}`, '', m.report.markdown_body.trim());
        } else {
          lines.push('', `### ${name}`, '', '*미작성*');
        }
      }
    }
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!departmentId) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-slate-500">부서 정보가 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Week Navigator */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setReferenceDate(subWeeks(referenceDate, 1))}>
          ←
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <CalendarDays className="h-4 w-4" />
          {data ? `${data.week_start} ~ ${data.week_end}` : dateKey}
          {data && <Badge variant="secondary" className="text-xs">{data.week_key}</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={() => setReferenceDate(addWeeks(referenceDate, 1))}>
          →
        </Button>
        <Button variant="outline" size="sm" onClick={() => setReferenceDate(new Date())}>
          이번 주
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button variant="ghost" size="sm" onClick={toggleAll} className="gap-1.5 text-xs">
          <ChevronsUpDown className="h-3.5 w-3.5" />
          전체 펼치기/접기
        </Button>
        <Button variant="ghost" size="sm" onClick={handlePrint} className="gap-1.5 text-xs print:hidden">
          <Printer className="h-3.5 w-3.5" />
          인쇄
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCopyMarkdown} className="gap-1.5 text-xs print:hidden">
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '복사됨' : '마크다운 복사'}
        </Button>
      </div>

      {isLoading && <div className="text-center py-12 text-slate-500">로딩 중...</div>}
      {error && <div className="text-center py-12 text-red-500">데이터를 불러올 수 없습니다.</div>}

      {data && (
        <>
          {/* Department Report */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5 text-indigo-500" />
                {data.department.name}
              </CardTitle>
            </CardHeader>
            {data.department_report && data.department_report.markdown_body?.trim() ? (
              <CardContent>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <WeeklyReportMarkdown value={data.department_report.markdown_body} emptyMessage="" compact />
                </div>
              </CardContent>
            ) : (
              <CardContent>
                <div className="text-sm text-slate-400">부서 보고서가 아직 작성되지 않았습니다.</div>
              </CardContent>
            )}
          </Card>

          {/* Sub-Team Sections */}
          <div className="space-y-3">
            {data.sub_teams.map((subTeam) => {
              const key = subTeam.id ?? 'unassigned';
              return (
                <SubTeamSection
                  key={key}
                  subTeam={subTeam}
                  isExpanded={expandedSubTeams.has(key)}
                  onToggle={() => toggleSubTeam(key)}
                  expandedMembers={expandedMembers}
                  onToggleMember={toggleMember}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default WeeklyReportHierarchyPage;
