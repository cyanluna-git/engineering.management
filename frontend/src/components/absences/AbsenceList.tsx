/**
 * AbsenceList - Table view of absences with CRUD actions
 * Shows absences filtered by department, with edit/delete for authorized users
 */
import { useState } from 'react';
import { Pencil, Trash2, Plus, UserMinus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useAbsences, useDeleteAbsence } from '@/hooks/useTeamCapacity';
import { AbsenceForm } from './AbsenceForm';
import type { Absence } from '@/types';

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  PARENTAL_LEAVE: '육아휴직',
  MEDICAL_LEAVE: '병가',
  SECONDMENT: '파견',
  SABBATICAL: '안식휴가',
  OTHER: '기타',
};

const ABSENCE_TYPE_COLORS: Record<string, string> = {
  PARENTAL_LEAVE: 'bg-purple-100 text-purple-700 border-purple-200',
  MEDICAL_LEAVE: 'bg-red-100 text-red-700 border-red-200',
  SECONDMENT: 'bg-blue-100 text-blue-700 border-blue-200',
  SABBATICAL: 'bg-green-100 text-green-700 border-green-200',
  OTHER: 'bg-slate-100 text-slate-700 border-slate-200',
};

const READ_ONLY_ROLES = ['GUEST', 'VIEWER'];

interface AbsenceListProps {
  departmentId: string;
  subTeamId?: string;
}

export function AbsenceList({ departmentId, subTeamId }: AbsenceListProps) {
  const { user } = useAuth();
  const isReadOnly = !user || READ_ONLY_ROLES.includes(user.role);

  const [formOpen, setFormOpen] = useState(false);
  const [editingAbsence, setEditingAbsence] = useState<Absence | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Absence | null>(null);

  const {
    data: absences = [],
    isLoading,
    error,
  } = useAbsences(
    { department_id: departmentId },
    { enabled: !!departmentId }
  );

  const deleteMutation = useDeleteAbsence();

  // Filter by sub-team if selected
  const filteredAbsences = subTeamId
    ? absences.filter((a) => a.sub_team_id === subTeamId)
    : absences;

  const handleAdd = () => {
    setEditingAbsence(undefined);
    setFormOpen(true);
  };

  const handleEdit = (absence: Absence) => {
    setEditingAbsence(absence);
    setFormOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const formatPeriod = (startDate: string, endDate: string | null): string => {
    const start = startDate.slice(0, 10);
    if (!endDate) return `${start} ~`;
    return `${start} ~ ${endDate.slice(0, 10)}`;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <UserMinus className="w-4 h-4 text-orange-500" />
            Absence Records
            {filteredAbsences.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-1">
                {filteredAbsences.length}
              </Badge>
            )}
          </h2>
          {!isReadOnly && (
            <Button
              size="sm"
              className="h-8 bg-blue-600 hover:bg-blue-700"
              onClick={handleAdd}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Absence
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-500">Failed to load absences</p>
          </div>
        ) : filteredAbsences.length === 0 ? (
          <div className="text-center py-8">
            <UserMinus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No absence records found</p>
            {!isReadOnly && (
              <p className="text-xs text-slate-400 mt-1">
                Click "Add Absence" to register a new absence
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">User</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Type</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Period</th>
                  <th className="text-center py-2 px-3 text-slate-500 font-medium">FTE Impact</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Remarks</th>
                  {!isReadOnly && (
                    <th className="text-center py-2 px-3 text-slate-500 font-medium w-24">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredAbsences.map((absence) => (
                  <tr key={absence.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <span className="font-medium text-slate-800">
                        {absence.user_name || absence.user_id}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] px-1.5 py-0',
                          ABSENCE_TYPE_COLORS[absence.absence_type] || ABSENCE_TYPE_COLORS.OTHER
                        )}
                      >
                        {ABSENCE_TYPE_LABELS[absence.absence_type] || absence.absence_type}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-slate-600 text-xs whitespace-nowrap">
                      {formatPeriod(absence.start_date, absence.end_date)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-orange-600 font-medium">
                        {absence.fte_impact}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-xs max-w-[200px] truncate">
                      {absence.remarks || '-'}
                    </td>
                    {!isReadOnly && (
                      <td className="py-2 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600"
                            onClick={() => handleEdit(absence)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                            onClick={() => setDeleteTarget(absence)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500">
              <span>
                Total: <strong className="text-slate-700">{filteredAbsences.length}</strong> records
              </span>
              <span>
                FTE Impact: <strong className="text-orange-600">
                  {Math.round(filteredAbsences.reduce((sum, a) => sum + a.fte_impact, 0) * 10) / 10}
                </strong>
              </span>
            </div>
          </div>
        )}

        {/* Create/Edit Form Dialog */}
        <AbsenceForm
          open={formOpen}
          onClose={() => {
            setFormOpen(false);
            setEditingAbsence(undefined);
          }}
          absence={editingAbsence}
          departmentId={departmentId}
        />

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(isOpen) => { if (!isOpen) setDeleteTarget(null); }}>
          <DialogContent className="sm:max-w-[400px] bg-white border shadow-lg">
            <DialogHeader>
              <DialogTitle>Absence 삭제</DialogTitle>
              <DialogDescription>
                이 작업은 되돌릴 수 없습니다.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3">
              <p className="text-sm text-slate-600">
                <strong>{deleteTarget?.user_name}</strong>의{' '}
                <strong>{ABSENCE_TYPE_LABELS[deleteTarget?.absence_type || ''] || deleteTarget?.absence_type}</strong>{' '}
                기록을 삭제하시겠습니까?
              </p>
              <p className="text-xs text-slate-400 mt-2">
                기간: {deleteTarget && formatPeriod(deleteTarget.start_date, deleteTarget.end_date)}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
