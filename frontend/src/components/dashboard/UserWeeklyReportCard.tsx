import { useState, useCallback } from "react";
import { format } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  PencilLine,
  Save,
  SquarePen,
  Users,
} from "lucide-react";

import {
  apiClient,
  getApiError,
  getCurrentWeeklyReport,
  getWeeklyReportHistory,
  upsertWeeklyReport,
} from "@/api/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  WeeklyReportMarkdown,
} from "@/components/dashboard/weekly-report-markdown";

interface UserWeeklyReportCardProps {
  referenceDate: Date;
  userId?: string;
  mode?: "card" | "action";
}

function getReferenceDateKey(referenceDate: Date) {
  return format(referenceDate, "yyyy-MM-dd");
}

function formatWeekLabel(weekStart: string, weekEnd: string) {
  return `${weekStart} ~ ${weekEnd}`;
}

export function UserWeeklyReportCard({
  referenceDate,
  userId,
  mode = "card",
}: UserWeeklyReportCardProps) {
  const { t } = useTranslation("dashboard");
  const { user } = useAuth();
  const isOwnData = !userId || userId === user?.id;
  const queryClient = useQueryClient();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [draftBody, setDraftBody] = useState("");

  const referenceDateKey = getReferenceDateKey(referenceDate);

  // Structured sections state
  interface ReportSection {
    project_id: string | null;
    project_name: string;
    body: string;
    source?: string;
  }
  const [draftSections, setDraftSections] = useState<ReportSection[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());

  // Prefetch user's active projects on mount (not on editor open)
  const activeProjectsQuery = useQuery({
    queryKey: ["user-active-projects", referenceDateKey],
    queryFn: () => apiClient.get(`/weekly-reports/user-projects?reference_date=${referenceDateKey}`).then(r => r.data),
    staleTime: 1000 * 60 * 5,
  });

  const toggleSectionCollapse = useCallback((index: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  const updateSectionBody = useCallback((index: number, body: string) => {
    setDraftSections(prev => prev.map((s, i) => i === index ? { ...s, body } : s));
  }, []);

  const currentQuery = useQuery({
    queryKey: ["weekly-report", "user", "current", referenceDateKey, userId],
    queryFn: () =>
      getCurrentWeeklyReport({
        scope: "user",
        reference_date: referenceDateKey,
        user_id: userId,
      }),
  });

  const historyQuery = useQuery({
    queryKey: ["weekly-report", "user", "history", userId],
    queryFn: () =>
      getWeeklyReportHistory({
        scope: "user",
        limit: 4,
        user_id: userId,
      }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertWeeklyReport({
        scope: "user",
        reference_date: referenceDateKey,
        markdown_body: draftBody,
        status: "published",
        sections: draftSections.length > 0 ? draftSections.map(s => ({
          project_id: s.project_id,
          project_name: s.project_name,
          body: s.body,
        })) : undefined,
      } as Parameters<typeof upsertWeeklyReport>[0]),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["weekly-report", "user"] }),
        queryClient.invalidateQueries({ queryKey: ["weekly-report-hierarchy"] }),
        queryClient.invalidateQueries({ queryKey: ["weekly-report-hierarchy-project"] }),
      ]);
      setIsEditorOpen(false);
    },
  });

  const currentData = currentQuery.data;
  const currentReport = currentData?.report ?? null;
  const historyItems = historyQuery.data ?? [];
  const handleOpenEditor = () => {
    const existingSections = (currentReport as unknown as { sections?: ReportSection[] | null })?.sections ?? null;
    const projects: Array<{ project_id: string; project_name: string; source: string }> =
      activeProjectsQuery.data?.projects ?? [];

    if (existingSections && existingSections.length > 0) {
      // Load existing structured sections + merge new projects
      const sectionMap = new Map(existingSections.map(s => [s.project_id, s]));
      const merged: ReportSection[] = [
        sectionMap.get(null) ?? { project_id: null, project_name: "Team", body: "" },
      ];
      for (const p of projects) {
        const existing = sectionMap.get(p.project_id);
        merged.push(existing ?? { project_id: p.project_id, project_name: p.project_name, body: "", source: p.source });
      }
      // Add sections from saved data that aren't in active projects (preserving old entries)
      for (const s of existingSections) {
        if (s.project_id !== null && !projects.some(p => p.project_id === s.project_id) && s.body.trim()) {
          merged.push(s);
        }
      }
      setDraftSections(merged);
    } else {
      // Legacy or new report: put existing markdown in Team section
      const sections: ReportSection[] = [
        { project_id: null, project_name: "Team", body: currentReport?.markdown_body ?? "" },
        ...projects.map(p => ({ project_id: p.project_id, project_name: p.project_name, body: "", source: p.source })),
      ];
      setDraftSections(sections);
    }

    // Composite preview
    setDraftBody(currentReport?.markdown_body ?? "");
    setCollapsedSections(new Set());
    setActiveTab("edit");
    setIsEditorOpen(true);
  };



  const saveErrorMessage = saveMutation.error ? getApiError(saveMutation.error).message : null;
  const editorDialog = (
    <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("weeklyReport.editorTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {currentData
              ? t("weeklyReport.currentWeekLabel", {
                  range: formatWeekLabel(currentData.week_start, currentData.week_end),
                })
              : t("weeklyReport.loading")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "edit" | "preview")}>
            <TabsList>
              <TabsTrigger value="edit" className="gap-2">
                <SquarePen className="h-3.5 w-3.5" />
                {t("weeklyReport.tabEdit")}
              </TabsTrigger>
              <TabsTrigger value="preview" className="gap-2">
                <Eye className="h-3.5 w-3.5" />
                {t("weeklyReport.tabPreview")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="mt-4 space-y-3">
              {draftSections.map((section, idx) => {
                const isTeam = section.project_id === null;
                const isCollapsed = collapsedSections.has(idx);
                const hasContent = section.body.trim().length > 0;

                return (
                  <div key={section.project_id ?? "team"} className={`rounded-lg border ${isTeam ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200'}`}>
                    <button
                      type="button"
                      onClick={() => !isTeam && toggleSectionCollapse(idx)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium"
                    >
                      {isTeam ? (
                        <Users className="h-4 w-4 text-blue-500 shrink-0" />
                      ) : isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span className={isTeam ? 'text-blue-700' : 'text-slate-700'}>
                        {section.project_name}
                      </span>
                      {!isTeam && section.source && (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {section.source === "planned" ? "계획" : "워크로그"}
                        </Badge>
                      )}
                      {!isTeam && !hasContent && (
                        <span className="ml-auto text-xs text-slate-400">미작성</span>
                      )}
                    </button>
                    {(!isCollapsed || isTeam) && (
                      <div className="px-4 pb-3">
                        <Textarea
                          value={section.body}
                          onChange={(e) => updateSectionBody(idx, e.target.value)}
                          placeholder={isTeam ? "팀 공통사항, 회의, 기타 업무..." : `${section.project_name} 관련 이번주 진행사항...`}
                          className="min-h-[240px] resize-y font-mono text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              {draftSections.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>
              )}
            </TabsContent>

            <TabsContent value="preview" className="mt-4">
              <div className="min-h-[360px] rounded-lg border border-slate-200 bg-slate-50 p-5">
                <WeeklyReportMarkdown
                  value={draftSections.map(s => {
                    if (!s.body.trim()) return '';
                    return `### ${s.project_name}\n${s.body}`;
                  }).filter(Boolean).join('\n\n')}
                  emptyMessage={t("weeklyReport.previewEmpty")}
                />
              </div>
            </TabsContent>
          </Tabs>

          {saveErrorMessage ? (
            <Alert variant="destructive">
              <AlertTitle>{t("weeklyReport.saveFailedTitle")}</AlertTitle>
              <AlertDescription>{saveErrorMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setIsEditorOpen(false)}>
              {t("weeklyReport.cancel")}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-2"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? t("weeklyReport.saving") : t("weeklyReport.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (mode === "action") {
    if (!isOwnData) {
      return null;
    }

    return (
      <>
        <Button
          type="button"
          size="sm"
          variant={currentReport ? "outline" : "default"}
          onClick={handleOpenEditor}
          disabled={currentQuery.isLoading}
          className="gap-1.5"
          data-testid="self-weekly-report-action"
        >
          {currentReport ? <PencilLine className="h-3.5 w-3.5" /> : <SquarePen className="h-3.5 w-3.5" />}
          {currentReport ? t("weeklyReport.edit") : t("weeklyReport.start")}
        </Button>
        {editorDialog}
      </>
    );
  }

  return (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-emerald-600" />
                {t("weeklyReport.title")}
              </CardTitle>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <CalendarDays className="h-3.5 w-3.5" />
                {currentData
                  ? t("weeklyReport.currentWeekLabel", {
                      range: formatWeekLabel(currentData.week_start, currentData.week_end),
                    })
                  : t("weeklyReport.loading")}
              </p>
            </div>

            {isOwnData && (
              <Button
                onClick={handleOpenEditor}
                size="sm"
                className="gap-2"
                disabled={currentQuery.isLoading}
              >
                {currentReport ? <PencilLine className="h-3.5 w-3.5" /> : <SquarePen className="h-3.5 w-3.5" />}
                {currentReport ? t("weeklyReport.edit") : t("weeklyReport.start")}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-0">
          {currentQuery.isLoading ? (
            <p className="text-sm text-slate-500">{t("weeklyReport.loading")}</p>
          ) : currentQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{t("weeklyReport.loadFailedTitle")}</AlertTitle>
              <AlertDescription>{t("weeklyReport.loadFailedBody")}</AlertDescription>
            </Alert>
          ) : currentReport ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="secondary">
                  {currentReport.status === "published"
                    ? t("weeklyReport.statusPublished")
                    : t("weeklyReport.statusDraft")}
                </Badge>
                <span>{t("weeklyReport.lastUpdated", { date: currentReport.updated_at.slice(0, 10) })}</span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <WeeklyReportMarkdown
                  value={currentReport.markdown_body}
                  emptyMessage={t("weeklyReport.previewEmpty")}
                  compact
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">{t("weeklyReport.emptyTitle")}</p>
            </div>
          )}

          {historyItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                {t("weeklyReport.recent")}
              </div>
              <div className="space-y-2">
                {historyItems.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-slate-700">{formatWeekLabel(item.week_start, item.week_end)}</div>
                    </div>
                    {currentReport?.id === item.id ? (
                      <Badge variant="secondary">{t("weeklyReport.currentBadge")}</Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      {editorDialog}
    </>
  );
}
