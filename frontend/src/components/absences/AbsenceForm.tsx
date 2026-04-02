/**
 * AbsenceForm - Dialog for creating/editing absence records
 * Supports all absence types with Korean labels
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getUsers } from '@/api/client';
import { useCreateAbsence, useUpdateAbsence } from '@/hooks/useTeamCapacity';
import type { Absence, AbsenceType, AbsenceCreate, AbsenceUpdate } from '@/types';

const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  PARENTAL_LEAVE: '육아휴직',
  MEDICAL_LEAVE: '병가',
  SECONDMENT: '파견',
  SABBATICAL: '안식휴가',
  OTHER: '기타',
};

const ABSENCE_TYPES: AbsenceType[] = [
  'PARENTAL_LEAVE',
  'MEDICAL_LEAVE',
  'SECONDMENT',
  'SABBATICAL',
  'OTHER',
];

interface AbsenceFormProps {
  open: boolean;
  onClose: () => void;
  absence?: Absence;
  departmentId: string;
  onSuccess?: () => void;
}

interface AbsenceFormState {
  userId: string;
  absenceType: AbsenceType;
  startDate: string;
  endDate: string;
  noEndDate: boolean;
  fteImpact: number;
  remarks: string;
  validationError: string;
}

function getInitialFormState(absence?: Absence): AbsenceFormState {
  if (!absence) {
    return {
      userId: '',
      absenceType: 'PARENTAL_LEAVE',
      startDate: '',
      endDate: '',
      noEndDate: false,
      fteImpact: -1.0,
      remarks: '',
      validationError: '',
    };
  }

  return {
    userId: absence.user_id,
    absenceType: absence.absence_type,
    startDate: absence.start_date,
    endDate: absence.end_date || '',
    noEndDate: !absence.end_date,
    fteImpact: absence.fte_impact,
    remarks: absence.remarks || '',
    validationError: '',
  };
}

export function AbsenceForm(props: AbsenceFormProps) {
  const formKey = `${props.absence?.id ?? 'new'}:${props.open ? 'open' : 'closed'}:${props.departmentId}`;

  return <AbsenceFormContent key={formKey} {...props} />;
}

function AbsenceFormContent({ open, onClose, absence, departmentId, onSuccess }: AbsenceFormProps) {
  const isEditMode = !!absence;
  const initialState = getInitialFormState(absence);

  const [userId, setUserId] = useState<string>(initialState.userId);
  const [absenceType, setAbsenceType] = useState<AbsenceType>(initialState.absenceType);
  const [startDate, setStartDate] = useState<string>(initialState.startDate);
  const [endDate, setEndDate] = useState<string>(initialState.endDate);
  const [noEndDate, setNoEndDate] = useState<boolean>(initialState.noEndDate);
  const [fteImpact, setFteImpact] = useState<number>(initialState.fteImpact);
  const [remarks, setRemarks] = useState<string>(initialState.remarks);
  const [validationError, setValidationError] = useState<string>(initialState.validationError);

  const createMutation = useCreateAbsence();
  const updateMutation = useUpdateAbsence();

  // Fetch users in the department for the dropdown
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'department', departmentId],
    queryFn: () => getUsers(departmentId),
    enabled: !!departmentId && open,
  });

  const resetForm = () => {
    const nextState = getInitialFormState();
    setUserId(nextState.userId);
    setAbsenceType(nextState.absenceType);
    setStartDate(nextState.startDate);
    setEndDate(nextState.endDate);
    setNoEndDate(nextState.noEndDate);
    setFteImpact(nextState.fteImpact);
    setRemarks(nextState.remarks);
    setValidationError(nextState.validationError);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const validate = (): boolean => {
    if (!userId) {
      setValidationError('사용자를 선택해주세요.');
      return false;
    }
    if (!startDate) {
      setValidationError('시작일을 입력해주세요.');
      return false;
    }
    if (!noEndDate && endDate && endDate < startDate) {
      setValidationError('종료일은 시작일 이후여야 합니다.');
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    if (isEditMode && absence) {
      const data: AbsenceUpdate = {
        absence_type: absenceType,
        start_date: startDate,
        end_date: noEndDate ? null : (endDate || null),
        fte_impact: fteImpact,
        remarks: remarks || null,
      };
      updateMutation.mutate(
        { id: absence.id, data },
        {
          onSuccess: () => {
            onSuccess?.();
            handleClose();
          },
        }
      );
    } else {
      const selectedUser = users.find((u) => u.id === userId);
      const data: AbsenceCreate = {
        user_id: userId,
        absence_type: absenceType,
        start_date: startDate,
        end_date: noEndDate ? null : (endDate || null),
        fte_impact: fteImpact,
        department_id: departmentId,
        sub_team_id: selectedUser?.sub_team_id || null,
        remarks: remarks || null,
      };
      createMutation.mutate(data, {
        onSuccess: () => {
          onSuccess?.();
          handleClose();
        },
      });
    }
  };

  // Sort users alphabetically by name
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <DialogContent className="sm:max-w-[500px] bg-white border shadow-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Absence 수정' : 'Absence 등록'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode ? '부재 정보를 수정합니다.' : '새 부재 기록을 등록합니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* User Select */}
          <div className="space-y-1.5">
            <Label htmlFor="absence-user">사용자</Label>
            {isEditMode ? (
              <Input
                id="absence-user"
                value={absence?.user_name || userId}
                disabled
                className="bg-slate-50"
              />
            ) : (
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="absence-user" className="h-9 text-sm">
                  <SelectValue placeholder="사용자 선택" />
                </SelectTrigger>
                <SelectContent>
                  {sortedUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                      {user.korean_name && ` (${user.korean_name})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Absence Type */}
          <div className="space-y-1.5">
            <Label htmlFor="absence-type">유형</Label>
            <Select value={absenceType} onValueChange={(v) => setAbsenceType(v as AbsenceType)}>
              <SelectTrigger id="absence-type" className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {ABSENCE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="absence-start">시작일</Label>
              <Input
                id="absence-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="absence-end">종료일</Label>
              <Input
                id="absence-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={noEndDate}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* No End Date Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={noEndDate}
              onChange={(e) => {
                setNoEndDate(e.target.checked);
                if (e.target.checked) setEndDate('');
              }}
              className="w-4 h-4 rounded border-slate-300"
            />
            <span className="text-sm text-slate-600">종료일 미정</span>
          </label>

          {/* FTE Impact */}
          <div className="space-y-1.5">
            <Label htmlFor="absence-fte">FTE Impact</Label>
            <Input
              id="absence-fte"
              type="number"
              step="0.1"
              min="-1.0"
              max="0"
              value={fteImpact}
              onChange={(e) => setFteImpact(parseFloat(e.target.value) || 0)}
              className="h-9 text-sm w-32"
            />
            <p className="text-xs text-slate-400">-1.0 = Full absence, -0.5 = Half</p>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <Label htmlFor="absence-remarks">비고</Label>
            <Textarea
              id="absence-remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="추가 메모 (선택사항)"
              rows={2}
              className="text-sm"
            />
          </div>

          {/* Validation Error */}
          {validationError && (
            <p className="text-sm text-red-500">{validationError}</p>
          )}

          {/* Mutation Error */}
          {(createMutation.isError || updateMutation.isError) && (
            <p className="text-sm text-red-500">
              저장에 실패했습니다. 다시 시도해주세요.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? '저장 중...' : (isEditMode ? '수정' : '등록')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
