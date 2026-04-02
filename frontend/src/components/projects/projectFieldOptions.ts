import type { ProjectScale, ProjectStatus } from '@/types';

export const PROJECT_STATUS_OPTIONS: Array<{ value: ProjectStatus; label: string; color: string }> = [
  { value: 'Lead', label: 'Lead', color: 'bg-gray-400' },
  { value: 'Opportunity', label: 'Opportunity', color: 'bg-cyan-400' },
  { value: 'Planning', label: 'Planning', color: 'bg-blue-400' },
  { value: 'Active', label: 'Active', color: 'bg-green-500' },
  { value: 'Launched', label: 'Launched', color: 'bg-purple-500' },
  { value: 'Complete', label: 'Complete', color: 'bg-gray-500' },
  { value: 'OnHold', label: 'On Hold', color: 'bg-yellow-500' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-red-500' },
];

export const PROJECT_SCALE_OPTIONS: Array<{ value: ProjectScale; label: string }> = [
  { value: 'CIP', label: 'CIP' },
  { value: 'A&D', label: 'A&D' },
  { value: 'Simple', label: 'Simple' },
  { value: 'Complex', label: 'Complex' },
  { value: 'Platform', label: 'Platform' },
];

export const PROJECT_CATEGORY_OPTIONS: Array<{
  value: 'PRODUCT' | 'FUNCTIONAL';
  label: string;
  color: string;
}> = [
  { value: 'PRODUCT', label: 'Product Project', color: 'bg-blue-500' },
  { value: 'FUNCTIONAL', label: 'Functional Project', color: 'bg-purple-500' },
];

export const PROJECT_STATUS_SELECT_OPTIONS = PROJECT_STATUS_OPTIONS.map(({ value, label }) => ({
  value,
  label,
}));

export const PROJECT_SCALE_SELECT_OPTIONS = PROJECT_SCALE_OPTIONS;

export const PROJECT_CATEGORY_SELECT_OPTIONS = PROJECT_CATEGORY_OPTIONS.map(({ value }) => ({
  value,
  label: value === 'PRODUCT' ? 'Product' : 'Functional',
}));
