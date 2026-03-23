/**
 * TeamsTab - Organization Hierarchy Management (Function Axis)
 * Simplified as Division section > Department card > SubTeam / Direct member drop zones
 */
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';

import { useApiError } from '@/hooks/useApiError';
import { useJobPositionsList } from '@/hooks/useJobPositionsCrud';
import { usePermissions } from '@/hooks/usePermissions';
import { UserEditModal } from '@/components/organization/ResourcesTab';
import {
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
    createDepartment,
    createDivision,
    createSubTeam,
    deleteDepartment,
    deleteDivision,
    deleteSubTeam,
    getDepartments,
    getDivisions,
    getSubTeams,
    getUsers,
    updateDepartment,
    updateDivision,
    updateSubTeam,
    updateUser,
    type Department,
    type SubTeam,
    type UserDetails,
} from '@/api/client';

type OrgLevel = 'level0' | 'level1' | 'level2';
type ModalMode = 'create' | 'edit';

interface OrgItem {
    type: OrgLevel;
    id: string;
    name: string;
    code: string;
    parentId?: string;
}

interface OrganizationSection {
    id: string;
    name: string;
    code?: string;
    departments: Department[];
    isUnassigned?: boolean;
}

interface UserDropTarget {
    departmentId: string;
    subTeamId: string | null;
    divisionId: string | null;
    key: string;
}

const buildDropTargetKey = (departmentId: string, subTeamId: string | null) =>
    `${departmentId}:${subTeamId ?? 'direct'}`;

export const TeamsTab: React.FC = () => {
    const queryClient = useQueryClient();
    const { canManageOrganization, canManageUsers } = usePermissions();
    const { t } = useTranslation('organization');
    const getErrorMessage = useApiError();

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<ModalMode>('create');
    const [editingItem, setEditingItem] = useState<OrgItem | null>(null);
    const [formData, setFormData] = useState({ name: '', code: '', parentId: '', targetLevel: '' as OrgLevel | '' });
    const [modalError, setModalError] = useState<string | null>(null);

    const [deleteConfirm, setDeleteConfirm] = useState<OrgItem | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const [draggedUserId, setDraggedUserId] = useState<string | null>(null);
    const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
    const [moveError, setMoveError] = useState<string | null>(null);
    const [editingMember, setEditingMember] = useState<UserDetails | null>(null);

    const { data: divisions = [], isLoading: loadingDivisions } = useQuery({
        queryKey: ['divisions'],
        queryFn: getDivisions,
    });

    const { data: allDepartments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => getDepartments(undefined, true),
    });

    const { data: allUsers = [] } = useQuery({
        queryKey: ['users-all'],
        queryFn: () => getUsers(undefined, true),
    });

    const { data: positions = [] } = useJobPositionsList();

    const departmentIds = useMemo(
        () => allDepartments.map((department) => department.id).sort(),
        [allDepartments]
    );

    const { data: allSubTeams = [] } = useQuery({
        queryKey: ['all-sub-teams', departmentIds],
        queryFn: async () => {
            const results = await Promise.all(
                departmentIds.map((departmentId) => getSubTeams(departmentId))
            );
            return results.flat();
        },
        enabled: departmentIds.length > 0,
    });

    const departmentsByDivision = useMemo(() => {
        const mapping = new Map<string, Department[]>();

        divisions.forEach((division) => {
            mapping.set(division.id, []);
        });

        allDepartments.forEach((department) => {
            if (!department.division_id) {
                return;
            }

            const existing = mapping.get(department.division_id) ?? [];
            existing.push(department);
            mapping.set(department.division_id, existing);
        });

        for (const departments of mapping.values()) {
            departments.sort((left, right) => left.name.localeCompare(right.name));
        }

        return mapping;
    }, [allDepartments, divisions]);

    const orphanedDepartments = useMemo(
        () => allDepartments.filter((department) => !department.division_id).sort((left, right) => left.name.localeCompare(right.name)),
        [allDepartments]
    );

    const subTeamsByDepartment = useMemo(() => {
        const mapping = new Map<string, SubTeam[]>();

        allSubTeams.forEach((subTeam) => {
            const existing = mapping.get(subTeam.department_id) ?? [];
            existing.push(subTeam);
            mapping.set(subTeam.department_id, existing);
        });

        for (const subTeams of mapping.values()) {
            subTeams.sort((left, right) => left.name.localeCompare(right.name));
        }

        return mapping;
    }, [allSubTeams]);

    const usersByDepartment = useMemo(() => {
        const mapping = new Map<string, UserDetails[]>();

        allUsers.forEach((user) => {
            if (!user.department_id) {
                return;
            }

            const existing = mapping.get(user.department_id) ?? [];
            existing.push(user);
            mapping.set(user.department_id, existing);
        });

        for (const users of mapping.values()) {
            users.sort((left, right) => {
                const leftName = left.korean_name || left.name;
                const rightName = right.korean_name || right.name;
                return leftName.localeCompare(rightName);
            });
        }

        return mapping;
    }, [allUsers]);

    const positionsById = useMemo(
        () => new Map(positions.map((position) => [position.id, position.name])),
        [positions]
    );

    const organizationSections = useMemo<OrganizationSection[]>(() => {
        const sections: OrganizationSection[] = divisions.map((division) => ({
            id: division.id,
            name: division.name,
            code: division.code,
            departments: departmentsByDivision.get(division.id) ?? [],
        }));

        if (orphanedDepartments.length > 0) {
            sections.push({
                id: 'unassigned',
                name: t('teams.unassignedDepts'),
                departments: orphanedDepartments,
                isUnassigned: true,
            });
        }

        return sections;
    }, [departmentsByDivision, divisions, orphanedDepartments, t]);

    const createL0 = useMutation({
        mutationFn: (data: { name: string; code: string }) =>
            createDivision({ name: data.name, code: data.code, is_active: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['divisions'] });
            closeModal();
        },
        onError: (error: unknown) => {
            setModalError(getErrorMessage(error));
        }
    });

    const updateL0 = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => updateDivision(id, { name }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['divisions'] });
            closeModal();
        },
        onError: (error: unknown) => {
            setModalError(getErrorMessage(error));
        }
    });

    const deleteL0 = useMutation({
        mutationFn: deleteDivision,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['divisions'] });
            setDeleteConfirm(null);
            setDeleteError(null);
        },
        onError: (error: unknown) => {
            setDeleteError(getErrorMessage(error));
        },
    });

    const createL1 = useMutation({
        mutationFn: (data: { name: string; code: string; parentId: string }) =>
            createDepartment({
                name: data.name,
                code: data.code,
                division_id: data.parentId || null,
                business_unit_id: null,
                is_active: true
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] });
            closeModal();
        },
        onError: (error: unknown) => {
            setModalError(getErrorMessage(error));
        }
    });

    const updateL1 = useMutation({
        mutationFn: ({ id, name, parentId }: { id: string; name: string; parentId?: string }) =>
            updateDepartment(id, { name, division_id: parentId || null }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] });
            closeModal();
        },
        onError: (error: unknown) => {
            setModalError(getErrorMessage(error));
        }
    });

    const deleteL1 = useMutation({
        mutationFn: deleteDepartment,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['departments'] });
            setDeleteConfirm(null);
            setDeleteError(null);
        },
        onError: (error: unknown) => {
            setDeleteError(getErrorMessage(error));
        },
    });

    const createL2 = useMutation({
        mutationFn: (data: { name: string; code: string; parentId: string }) =>
            createSubTeam(data.parentId, { name: data.name, code: data.code, is_active: true }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-sub-teams'] });
            closeModal();
        },
        onError: (error: unknown) => {
            setModalError(getErrorMessage(error));
        }
    });

    const updateL2 = useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) => updateSubTeam(id, { name }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-sub-teams'] });
            closeModal();
        },
        onError: (error: unknown) => {
            setModalError(getErrorMessage(error));
        }
    });

    const deleteL2 = useMutation({
        mutationFn: deleteSubTeam,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-sub-teams'] });
            setDeleteConfirm(null);
            setDeleteError(null);
        },
        onError: (error: unknown) => {
            setDeleteError(getErrorMessage(error));
        },
    });

    const moveUserMutation = useMutation({
        mutationFn: ({ user, target }: { user: UserDetails; target: UserDropTarget }) =>
            updateUser(user.id, {
                division_id: target.divisionId,
                department_id: target.departmentId,
                sub_team_id: target.subTeamId,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users-all'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setMoveError(null);
        },
        onError: (error: unknown) => {
            setMoveError(getErrorMessage(error));
        },
        onSettled: () => {
            setDraggedUserId(null);
            setActiveDropTarget(null);
        },
    });

    const openCreateModal = (type: OrgLevel, parentId?: string) => {
        setModalMode('create');
        setEditingItem({ type, id: '', name: '', code: '', parentId });
        setFormData({ name: '', code: '', parentId: parentId || '', targetLevel: type });
        setModalError(null);
        setModalOpen(true);
    };

    const openEditModal = (item: OrgItem) => {
        setModalMode('edit');
        setEditingItem(item);
        setFormData({ name: item.name, code: item.code, parentId: item.parentId || '', targetLevel: item.type });
        setModalError(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingItem(null);
        setFormData({ name: '', code: '', parentId: '', targetLevel: '' });
        setModalError(null);
    };

    const handleSave = () => {
        setModalError(null);
        if (!formData.name.trim()) return;

        const code = formData.code.trim() || formData.name.toUpperCase().replace(/\s+/g, '_').slice(0, 10);

        if (modalMode === 'create') {
            if (formData.targetLevel === 'level0') {
                createL0.mutate({ name: formData.name, code });
            } else if (formData.targetLevel === 'level1') {
                createL1.mutate({ name: formData.name, code, parentId: formData.parentId });
            } else if (formData.targetLevel === 'level2' && formData.parentId) {
                createL2.mutate({ name: formData.name, code, parentId: formData.parentId });
            }
        } else if (editingItem) {
            if (editingItem.type === 'level0') {
                updateL0.mutate({ id: editingItem.id, name: formData.name });
            } else if (editingItem.type === 'level1') {
                updateL1.mutate({ id: editingItem.id, name: formData.name, parentId: formData.parentId });
            } else if (editingItem.type === 'level2') {
                updateL2.mutate({ id: editingItem.id, name: formData.name });
            }
        }
    };

    const handleDelete = () => {
        if (!deleteConfirm) return;
        if (deleteConfirm.type === 'level0') deleteL0.mutate(deleteConfirm.id);
        else if (deleteConfirm.type === 'level1') deleteL1.mutate(deleteConfirm.id);
        else if (deleteConfirm.type === 'level2') deleteL2.mutate(deleteConfirm.id);
    };

    const handleDrop = (target: UserDropTarget) => {
        if (!canManageUsers || !draggedUserId) {
            return;
        }

        const draggedUser = allUsers.find((user) => user.id === draggedUserId);
        if (!draggedUser) {
            return;
        }

        const isSameAssignment =
            draggedUser.department_id === target.departmentId &&
            (draggedUser.sub_team_id ?? null) === target.subTeamId &&
            (draggedUser.division_id ?? null) === target.divisionId;

        if (isSameAssignment) {
            setDraggedUserId(null);
            setActiveDropTarget(null);
            return;
        }

        moveUserMutation.mutate({ user: draggedUser, target });
    };

    if (loadingDivisions) return <div className="py-8 text-center">{t('common:status.loading')}</div>;

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                        <CardTitle>{t('teams.hierarchy')}</CardTitle>
                        <CardDescription>{t('teams.listSubtitle')}</CardDescription>
                    </div>
                    {canManageOrganization && (
                        <Button onClick={() => openCreateModal('level0')}>{t('teams.addDivision')}</Button>
                    )}
                </CardHeader>
                <CardContent className="space-y-4">
                    {moveError && (
                        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                            {moveError}
                        </div>
                    )}

                    {organizationSections.map((section) => {
                        const sectionMemberCount = section.departments.reduce(
                            (count, department) => count + (usersByDepartment.get(department.id)?.length ?? 0),
                            0
                        );

                        return (
                            <section
                                key={section.id}
                                className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                data-testid={`division-section-${section.id}`}
                            >
                                <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                                    <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-lg font-semibold text-slate-900">{section.name}</h3>
                                            {section.code && (
                                                <span className="text-xs text-muted-foreground">({section.code})</span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            <Badge variant="outline">
                                                {t('teams.departmentsSummary', { count: section.departments.length })}
                                            </Badge>
                                            <Badge variant="outline">
                                                {t('teams.membersSummary', { count: sectionMemberCount })}
                                            </Badge>
                                        </div>
                                    </div>

                                    {canManageOrganization && (
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openCreateModal('level1', section.isUnassigned ? undefined : section.id)}
                                            >
                                                {t('teams.addDept')}
                                            </Button>
                                            {!section.isUnassigned && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8"
                                                            aria-label={`Manage division ${section.name}`}
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onSelect={() => openEditModal({
                                                                type: 'level0',
                                                                id: section.id,
                                                                name: section.name,
                                                                code: section.code || '',
                                                            })}
                                                        >
                                                            {t('teams.editOrg')}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-red-600 focus:text-red-600"
                                                            onSelect={() => setDeleteConfirm({
                                                                type: 'level0',
                                                                id: section.id,
                                                                name: section.name,
                                                                code: section.code || '',
                                                            })}
                                                        >
                                                            {t('common:buttons.delete')}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {section.departments.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-muted-foreground">
                                        {t('teams.noDepartments')}
                                    </div>
                                ) : (
                                    <div className="grid gap-4 xl:grid-cols-2">
                                        {section.departments.map((department) => (
                                            <DepartmentCard
                                                key={department.id}
                                                department={department}
                                                divisionId={department.division_id}
                                                members={usersByDepartment.get(department.id) ?? []}
                                                subTeams={subTeamsByDepartment.get(department.id) ?? []}
                                                positionsById={positionsById}
                                                canManageOrganization={canManageOrganization}
                                                canManageUsers={canManageUsers}
                                                draggedUserId={draggedUserId}
                                                activeDropTarget={activeDropTarget}
                                                onDragStart={setDraggedUserId}
                                                onDragEnd={() => {
                                                    setDraggedUserId(null);
                                                    setActiveDropTarget(null);
                                                }}
                                                onDragEnter={setActiveDropTarget}
                                                onDragLeave={() => setActiveDropTarget(null)}
                                                onDrop={handleDrop}
                                                onEditDepartment={() => openEditModal({
                                                    type: 'level1',
                                                    id: department.id,
                                                    name: department.name,
                                                    code: department.code,
                                                    parentId: department.division_id || undefined,
                                                })}
                                                onDeleteDepartment={() => setDeleteConfirm({
                                                    type: 'level1',
                                                    id: department.id,
                                                    name: department.name,
                                                    code: department.code,
                                                })}
                                                onAddSubTeam={() => openCreateModal('level2', department.id)}
                                                onEditSubTeam={(subTeam) => openEditModal({
                                                    type: 'level2',
                                                    id: subTeam.id,
                                                    name: subTeam.name,
                                                    code: subTeam.code,
                                                    parentId: department.id,
                                                })}
                                                onDeleteSubTeam={(subTeam) => setDeleteConfirm({
                                                    type: 'level2',
                                                    id: subTeam.id,
                                                    name: subTeam.name,
                                                    code: subTeam.code,
                                                })}
                                                onEditMember={setEditingMember}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </CardContent>
            </Card>

            <Dialog open={modalOpen} onOpenChange={closeModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {modalMode === 'create' ? t('teams.addOrg') : t('teams.editOrg')}
                        </DialogTitle>
                        <DialogDescription>{t('teams.orgFormDesc')}</DialogDescription>
                    </DialogHeader>

                    {modalError && (
                        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                            {modalError}
                        </div>
                    )}

                    <div className="space-y-4 py-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium">{t('teams.level')}</label>
                            <div className="rounded bg-slate-100 px-3 py-2 text-sm font-medium">
                                {formData.targetLevel === 'level0' ? 'Level 0 (Division)' :
                                    formData.targetLevel === 'level1' ? 'Level 1 (Department)' : 'Level 2 (SubTeam)'}
                            </div>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium">{t('teams.nameRequired')}</label>
                            <input
                                type="text"
                                className="w-full rounded border px-3 py-2"
                                value={formData.name}
                                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                placeholder={t('teams.orgNamePlaceholder')}
                            />
                        </div>

                        {formData.targetLevel === 'level1' && (
                            <div>
                                <label className="mb-1 block text-sm font-medium">{t('teams.parentDivision')}</label>
                                <select
                                    className="w-full rounded border px-3 py-2"
                                    value={formData.parentId}
                                    onChange={(event) => setFormData({ ...formData, parentId: event.target.value })}
                                >
                                    <option value="">{t('teams.noParent')}</option>
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>
                                            {division.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {modalMode === 'create' && (
                            <div>
                                <label className="mb-1 block text-sm font-medium">{t('teams.code')}</label>
                                <input
                                    type="text"
                                    className="w-full rounded border px-3 py-2"
                                    value={formData.code}
                                    onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                                    placeholder={t('teams.codeAutoGenerated')}
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeModal}>{t('common:buttons.cancel')}</Button>
                        <Button onClick={handleSave} disabled={!formData.name.trim()}>
                            {modalMode === 'create' ? t('common:buttons.add') : t('common:buttons.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!deleteConfirm} onOpenChange={() => { setDeleteConfirm(null); setDeleteError(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('teams.deleteConfirmTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('teams.deleteConfirmMessage', { name: deleteConfirm?.name })}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteError && (
                        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {deleteError}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}>{t('common:buttons.cancel')}</Button>
                        <Button variant="destructive" onClick={handleDelete}>{t('common:buttons.delete')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {editingMember && (
                <UserEditModal
                    user={editingMember}
                    positions={positions}
                    onClose={() => setEditingMember(null)}
                    onSuccess={() => {
                        setEditingMember(null);
                        queryClient.invalidateQueries({ queryKey: ['users-all'] });
                        queryClient.invalidateQueries({ queryKey: ['users'] });
                    }}
                />
            )}
        </>
    );
};

const DepartmentCard: React.FC<{
    department: Department;
    divisionId: string | null;
    members: UserDetails[];
    subTeams: SubTeam[];
    positionsById: Map<string, string>;
    canManageOrganization: boolean;
    canManageUsers: boolean;
    draggedUserId: string | null;
    activeDropTarget: string | null;
    onDragStart: (userId: string) => void;
    onDragEnd: () => void;
    onDragEnter: (targetKey: string) => void;
    onDragLeave: () => void;
    onDrop: (target: UserDropTarget) => void;
    onEditDepartment: () => void;
    onDeleteDepartment: () => void;
    onAddSubTeam: () => void;
    onEditSubTeam: (subTeam: SubTeam) => void;
    onDeleteSubTeam: (subTeam: SubTeam) => void;
    onEditMember: (member: UserDetails) => void;
}> = ({
    department,
    divisionId,
    members,
    subTeams,
    positionsById,
    canManageOrganization,
    canManageUsers,
    draggedUserId,
    activeDropTarget,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDrop,
    onEditDepartment,
    onDeleteDepartment,
    onAddSubTeam,
    onEditSubTeam,
    onDeleteSubTeam,
    onEditMember,
}) => {
    const { t } = useTranslation('organization');
    const directMembers = members.filter((member) => !member.sub_team_id);

    return (
        <div
            className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm"
            data-testid={`department-card-${department.id}`}
        >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900">{department.name}</h4>
                        <span className="text-xs text-muted-foreground">({department.code})</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{t('teams.teamsSummary', { count: subTeams.length })}</Badge>
                        <Badge variant="outline">{t('teams.membersSummary', { count: members.length })}</Badge>
                    </div>
                </div>

                {canManageOrganization && (
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={onAddSubTeam}>
                            {t('teams.addTeam')}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8"
                                    aria-label={`Manage department ${department.name}`}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={onEditDepartment}>
                                    {t('teams.editOrg')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
                                    onSelect={onDeleteDepartment}
                                >
                                    {t('common:buttons.delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            <div className="mt-4 space-y-3">
                {subTeams.map((subTeam) => (
                    <MemberDropZone
                        key={subTeam.id}
                        title={subTeam.name}
                        badgeLabel={t('teams.teamBadge')}
                        members={members.filter((member) => member.sub_team_id === subTeam.id)}
                        target={{
                            departmentId: department.id,
                            subTeamId: subTeam.id,
                            divisionId,
                            key: buildDropTargetKey(department.id, subTeam.id),
                        }}
                        positionsById={positionsById}
                        canManageOrganization={canManageOrganization}
                        canManageUsers={canManageUsers}
                        draggedUserId={draggedUserId}
                        activeDropTarget={activeDropTarget}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onDragEnter={onDragEnter}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onEdit={() => onEditSubTeam(subTeam)}
                        onDelete={() => onDeleteSubTeam(subTeam)}
                        onEditMember={onEditMember}
                        dataTestId={`subteam-zone-${subTeam.id}`}
                    />
                ))}

                <MemberDropZone
                    title={t('teams.directMembers')}
                    badgeLabel={t('teams.directBadge')}
                    members={directMembers}
                    target={{
                        departmentId: department.id,
                        subTeamId: null,
                        divisionId,
                        key: buildDropTargetKey(department.id, null),
                    }}
                    positionsById={positionsById}
                    canManageOrganization={false}
                    canManageUsers={canManageUsers}
                    draggedUserId={draggedUserId}
                    activeDropTarget={activeDropTarget}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onEditMember={onEditMember}
                    emptyHint={t('teams.directDropHint')}
                    dataTestId={`direct-zone-${department.id}`}
                />
            </div>
        </div>
    );
};

const MemberDropZone: React.FC<{
    title: string;
    badgeLabel: string;
    members: UserDetails[];
    target: UserDropTarget;
    positionsById: Map<string, string>;
    canManageOrganization: boolean;
    canManageUsers: boolean;
    draggedUserId: string | null;
    activeDropTarget: string | null;
    onDragStart: (userId: string) => void;
    onDragEnd: () => void;
    onDragEnter: (targetKey: string) => void;
    onDragLeave: () => void;
    onDrop: (target: UserDropTarget) => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onEditMember: (member: UserDetails) => void;
    emptyHint?: string;
    dataTestId: string;
}> = ({
    title,
    badgeLabel,
    members,
    target,
    positionsById,
    canManageOrganization,
    canManageUsers,
    draggedUserId,
    activeDropTarget,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragLeave,
    onDrop,
    onEdit,
    onDelete,
    onEditMember,
    emptyHint,
    dataTestId,
}) => {
    const { t } = useTranslation('organization');
    const isActiveTarget = activeDropTarget === target.key;

    return (
        <div
            className={cn(
                'rounded-xl border border-slate-200 bg-white p-3 transition-colors',
                isActiveTarget && 'border-blue-400 bg-blue-50/70 shadow-sm'
            )}
            data-testid={dataTestId}
            onDragOver={(event) => {
                if (!canManageUsers) {
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            }}
            onDragEnter={(event) => {
                if (!canManageUsers) {
                    return;
                }
                event.preventDefault();
                onDragEnter(target.key);
            }}
            onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    return;
                }
                onDragLeave();
            }}
            onDrop={(event) => {
                if (!canManageUsers) {
                    return;
                }
                event.preventDefault();
                onDrop(target);
            }}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h5 className="font-medium text-slate-900">{title}</h5>
                        <Badge variant="outline">{badgeLabel}</Badge>
                        <span className="text-xs text-muted-foreground">
                            {t('teams.membersSummary', { count: members.length })}
                        </span>
                    </div>
                    {canManageUsers && draggedUserId && (
                        <p className="mt-1 text-xs text-muted-foreground">
                            {isActiveTarget ? t('teams.dropReady') : t('teams.dragHint')}
                        </p>
                    )}
                </div>

                {canManageOrganization && (onEdit || onDelete) && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8"
                                aria-label={`Manage ${title}`}
                            >
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {onEdit && (
                                <DropdownMenuItem onSelect={onEdit}>
                                    {t('teams.editOrg')}
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={onDelete}>
                                    {t('common:buttons.delete')}
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            <div className="mt-3 space-y-2">
                {members.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-muted-foreground">
                        {emptyHint || t('teams.emptyDropZone')}
                    </div>
                ) : (
                    members.map((member) => (
                        <MemberCard
                            key={member.id}
                            member={member}
                            positionName={positionsById.get(member.position_id)}
                            canManageUsers={canManageUsers}
                            isDragging={draggedUserId === member.id}
                            onDragStart={onDragStart}
                            onDragEnd={onDragEnd}
                            onEdit={() => onEditMember(member)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

const MemberCard: React.FC<{
    member: UserDetails;
    positionName?: string;
    canManageUsers: boolean;
    isDragging: boolean;
    onDragStart: (userId: string) => void;
    onDragEnd: () => void;
    onEdit: () => void;
}> = ({ member, positionName, canManageUsers, isDragging, onDragStart, onDragEnd, onEdit }) => {
    const displayName = member.korean_name || member.name;

    return (
        <div
            className={cn(
                'flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm',
                canManageUsers && 'cursor-grab',
                isDragging && 'opacity-50'
            )}
            draggable={canManageUsers}
            data-testid={`member-card-${member.id}`}
            onDragStart={(event) => {
                if (!canManageUsers) {
                    event.preventDefault();
                    return;
                }
                event.dataTransfer.setData('text/plain', member.id);
                event.dataTransfer.effectAllowed = 'move';
                onDragStart(member.id);
            }}
            onDragEnd={onDragEnd}
        >
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{displayName}</span>
                    {member.korean_name && member.name && member.korean_name !== member.name && (
                        <span className="text-xs text-muted-foreground">({member.name})</span>
                    )}
                </div>
                {positionName && (
                    <p className="mt-1 text-xs text-muted-foreground">{positionName}</p>
                )}
            </div>

            {canManageUsers && (
                <Button variant="ghost" size="sm" className="h-8 w-8" onClick={onEdit} aria-label={`Edit member ${displayName}`}>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            )}
        </div>
    );
};

export default TeamsTab;
