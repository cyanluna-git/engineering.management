import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { MeetingImportDraft } from '@/api/worklogs';

interface MeetingImportPreviewModalProps {
  isOpen: boolean;
  items: MeetingImportDraft[];
  skippedCount: number;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirm: (selectedItems: MeetingImportDraft[]) => Promise<void> | void;
}

export const MeetingImportPreviewModal: React.FC<MeetingImportPreviewModalProps> = ({
  isOpen,
  items,
  skippedCount,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation('worklogs');
  const selectableItems = useMemo(
    () => items.filter((item) => !item.already_imported && !!item.work_type_category_id),
    [items],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedIds(selectableItems.map((item) => item.external_event_id));
  }, [isOpen, selectableItems]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.external_event_id)),
    [items, selectedIds],
  );

  const toggleSelection = (eventId: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(eventId) ? current : [...current, eventId];
      }
      return current.filter((id) => id !== eventId);
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(selectableItems.map((item) => item.external_event_id));
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleConfirm = async () => {
    await onConfirm(selectedItems);
  };

  const renderItemBadge = (item: MeetingImportDraft) => {
    if (item.already_imported) {
      return <Badge variant="secondary">{t('meetingImport.badges.imported')}</Badge>;
    }
    if (!item.work_type_category_id) {
      return <Badge variant="destructive">{t('meetingImport.badges.manualReview')}</Badge>;
    }
    return <Badge variant="default">{t('meetingImport.badges.ready')}</Badge>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('meetingImport.previewTitle', { count: items.length })}</DialogTitle>
          <DialogDescription>{t('meetingImport.previewDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          {(skippedCount > 0 || items.some((item) => item.already_imported || !item.work_type_category_id)) && (
            <Alert>
              <AlertTitle>{t('meetingImport.alertTitle')}</AlertTitle>
              <AlertDescription>
                {t('meetingImport.alertDescription', { skipped: skippedCount })}
              </AlertDescription>
            </Alert>
          )}

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t('meetingImport.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={isSubmitting || selectableItems.length === 0 || selectedIds.length === selectableItems.length}
                >
                  {t('meetingImport.selectAll')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={isSubmitting || selectedIds.length === 0}
                >
                  {t('meetingImport.clearSelection')}
                </Button>
              </div>
              {items.map((item) => {
                const disabled = item.already_imported || !item.work_type_category_id;
                const checked = selectedIds.includes(item.external_event_id);

                return (
                  <label
                    key={item.external_event_id}
                    className={`flex gap-3 rounded-lg border p-4 transition-colors ${
                      disabled ? 'bg-slate-50 opacity-80' : 'hover:border-blue-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      disabled={disabled || isSubmitting}
                      checked={disabled ? false : checked}
                      onChange={(event) => toggleSelection(item.external_event_id, event.target.checked)}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{item.subject}</p>
                          <p className="text-sm text-slate-500">
                            {format(new Date(item.start_at), 'yyyy-MM-dd HH:mm')} - {format(new Date(item.end_at), 'HH:mm')} · {item.hours}h
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.online_meeting && <Badge variant="outline">Teams</Badge>}
                          {renderItemBadge(item)}
                        </div>
                      </div>

                      <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                        <div>
                          <span className="font-medium">{t('meetingImport.fields.project')}:</span>{' '}
                          {item.project_name ? `${item.project_code ?? ''} ${item.project_name}`.trim() : t('meetingImport.unmapped')}
                        </div>
                        <div>
                          <span className="font-medium">{t('meetingImport.fields.workType')}:</span>{' '}
                          {item.work_type_category_name ?? t('meetingImport.unmapped')}
                        </div>
                        <div>
                          <span className="font-medium">{t('meetingImport.fields.location')}:</span>{' '}
                          {item.location || t('meetingImport.none')}
                        </div>
                        <div>
                          <span className="font-medium">{t('meetingImport.fields.attendees')}:</span>{' '}
                          {item.attendee_count}
                        </div>
                      </div>

                      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {item.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t('meetingImport.selectedCount', { count: selectedItems.length })}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                {t('entryModal.cancel')}
              </Button>
              <Button onClick={handleConfirm} disabled={isSubmitting || selectedItems.length === 0}>
                {isSubmitting
                  ? t('meetingImport.importing')
                  : t('meetingImport.confirmButton', { count: selectedItems.length })}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MeetingImportPreviewModal;
