/**
 * ProjectHierarchyEditor - Hierarchical management of projects
 * Level 0 (Business Unit) > Level 1 (Product Line) > Level 2 (Project)
 */
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Input,
    Label,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Badge,
    StatusBadge,
} from '@/components/ui';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    getBusinessUnits,
    createBusinessUnit,
    updateBusinessUnit,
    deleteBusinessUnit,
    createProductLine,
    updateProductLine,
    deleteProductLine,
    deleteProject as apiDeleteProject,
    getProjects,
    getProductLines,
    getDepartments,
} from '@/api/client';
import type { BusinessUnit, ProductLine, Project, ProjectCreate, ProjectUpdate } from '@/types';
import { useApiError } from '@/hooks/useApiError';
import { useTranslation } from 'react-i18next';
import { useProjectHierarchy, type HierarchyNode } from '@/hooks/useProjectHierarchy';
import { useUsers } from '@/hooks/useUsers';
import ProjectForm from '@/components/forms/ProjectForm';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { ProjectInlineTable } from './ProjectInlineTable';
import { IOManagementTab } from './IOManagementTab';
import { useInternalIOsList } from '@/hooks/useInternalIOs';
import { useRechargeIOsList } from '@/hooks/useRechargeIOs';
import { MoreHorizontal } from 'lucide-react';

type HierarchyLevel = 'business_unit' | 'product_line' | 'project';
type ProjectHierarchyTab = 'product' | 'functional' | 'all' | 'io-management';
type ProductLineCategory = NonNullable<ProductLine['line_category']>;
type ProjectInitialValues = Partial<ProjectCreate | ProjectUpdate>;

interface ProjectHierarchyLocationState {
    activeTab?: ProjectHierarchyTab;
}

interface ProjectHierarchyProjectNode extends HierarchyNode {
    type: 'project';
    status: string;
    internal_io?: {
        io_number?: string;
    };
}

interface ProductLineNode extends HierarchyNode {
    type: 'product_line';
    code: string;
    line_category?: ProductLineCategory;
    description?: string;
    children?: ProjectHierarchyProjectNode[];
}

interface BusinessUnitNode extends HierarchyNode {
    type: 'business_unit';
    code: string;
    children?: ProductLineNode[];
}

interface DepartmentNode extends HierarchyNode {
    type: 'department';
    children?: ProjectHierarchyProjectNode[];
}

// Status priority order: InProgress first, then Prospective, then others
const STATUS_PRIORITY: Record<string, number> = {
    'Active': 1,
    'Planning': 2,
    'Opportunity': 3,
    'Lead': 4,
    'Launched': 5,
    'OnHold': 6,
    'Complete': 7,
    'Cancelled': 8,
};

// Active statuses for filtering
const ACTIVE_STATUSES = ['Active', 'Planning', 'Opportunity'];

// Filter projects to only active ones
const filterActiveProjects = <T extends { status: string }>(projects: T[]): T[] => {
    if (!projects) return [];
    return projects.filter(p => ACTIVE_STATUSES.includes(p.status));
};

// Sort projects by status priority
const sortProjectsByStatus = <T extends { status: string }>(projects: T[]): T[] => {
    if (!projects) return [];
    return [...projects].sort((a, b) => {
        const priorityA = STATUS_PRIORITY[a.status] || 99;
        const priorityB = STATUS_PRIORITY[b.status] || 99;
        return priorityA - priorityB;
    });
};

interface ProductLineGroup {
    businessUnit: BusinessUnitNode;
    productLine: ProductLineNode;
    projects: ProjectHierarchyProjectNode[];
}

export const ProjectHierarchyEditor: React.FC = () => {

    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const location = useLocation();
    const { canManageProjects } = usePermissions();
    const getErrorMessage = useApiError();
    const { t } = useTranslation('projects');
    const { data: hierarchy, isLoading } = useProjectHierarchy();
    const productProjects = useMemo<BusinessUnitNode[]>(
        () => (hierarchy?.product_projects ?? []) as BusinessUnitNode[],
        [hierarchy?.product_projects]
    );
    const functionalProjects = useMemo<DepartmentNode[]>(
        () => (hierarchy?.functional_projects ?? []) as DepartmentNode[],
        [hierarchy?.functional_projects]
    );
    const ungroupedProjects = useMemo<ProjectHierarchyProjectNode[]>(
        () => (hierarchy?.ungrouped_projects ?? []) as ProjectHierarchyProjectNode[],
        [hierarchy?.ungrouped_projects]
    );

    // Fetch Business Units for Product Line modal
    const { data: businessUnits = [] } = useQuery({
        queryKey: ['businessUnits'],
        queryFn: getBusinessUnits,
    });

    // Fetch all projects for management tab (increased limit to include matrix projects)
    const { data: allProjects = [] } = useQuery({
        queryKey: ['projects'],
        queryFn: () => getProjects({ limit: 500 }),
    });

    // Fetch product lines for inline table
    const { data: productLines = [] } = useQuery({
        queryKey: ['productLines'],
        queryFn: getProductLines,
    });

    // Fetch departments for owner department selection
    const { data: departments = [] } = useQuery({
        queryKey: ['departments'],
        queryFn: () => getDepartments(),
    });

    // Fetch users for PM selection
    const { data: users = [] } = useUsers();

    // Fetch IO data for inline table dropdowns
    const { data: internalIOs = [] } = useInternalIOsList({ is_active: true });
    const { data: rechargeIOs = [] } = useRechargeIOsList({ is_active: true });

    // State
    const [collapsedFunctionalIds, setCollapsedFunctionalIds] = useState<Set<string>>(new Set());
    const returnTab = (location.state as ProjectHierarchyLocationState | null)?.activeTab;
    const [activeTab, setActiveTab] = useState<ProjectHierarchyTab>(returnTab || 'product');
    const expandedIds = useMemo(() => {
        return new Set(
            functionalProjects
                .map((dept) => dept.id)
                .filter((id) => !collapsedFunctionalIds.has(id))
        );
    }, [collapsedFunctionalIds, functionalProjects]);

    // Filter for Active Projects tab - only InProgress and Prospective
    const activeUngroupedProjects = useMemo(() => {
        return filterActiveProjects(ungroupedProjects);
    }, [ungroupedProjects]);

    const activeProductProjects = useMemo<BusinessUnitNode[]>(() => {
        return productProjects.map((bu) => ({
            ...bu,
            children: bu.children?.map((pl) => ({
                ...pl,
                children: filterActiveProjects(pl.children || [])
            })).filter((pl) => pl.children && pl.children.length > 0) || []
        })).filter((bu) => bu.children && bu.children.length > 0);
    }, [productProjects]);

    const activeProductGroups = useMemo<ProductLineGroup[]>(() => {
        return activeProductProjects.flatMap((bu) =>
            (bu.children || []).map((pl) => ({
                businessUnit: bu,
                productLine: pl,
                projects: sortProjectsByStatus(pl.children || []),
            }))
        );
    }, [activeProductProjects]);

    // Sorting and filtering are now handled by ProjectInlineTable component

    // Business Unit Modal State
    const [buModalOpen, setBuModalOpen] = useState(false);
    const [buFormData, setBuFormData] = useState<{ id?: string; name: string; code: string; is_active: boolean }>({
        name: '',
        code: '',
        is_active: true,
    });

    // Product Line Modal State
    const [plModalOpen, setPlModalOpen] = useState(false);
    const [plFormData, setPlFormData] = useState<{
        id?: string;
        name: string;
        code: string;
        business_unit_id: string;
        line_category: 'PRODUCT' | 'PLATFORM' | 'LEGACY';
        description?: string;
    }>({
        name: '',
        code: '',
        business_unit_id: '',
        line_category: 'PRODUCT',
        description: '',
    });

    // Project Modal State
    const [projectModalOpen, setProjectModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
    const [projectInitialValues, setProjectInitialValues] = useState<ProjectInitialValues>({});

    // Delete Confirmation
    const [deleteConfirm, setDeleteConfirm] = useState<{ type: HierarchyLevel; id: string; name: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Toggle Expansion

    const toggleExpand = (id: string) => {
        setCollapsedFunctionalIds((previous) => {
            const next = new Set(previous);
            if (expandedIds.has(id)) {
                next.add(id);
            } else {
                next.delete(id);
            }
            return next;
        });
    };

    // --- Business Unit Mutations ---
    const createBuMutation = useMutation({
        mutationFn: createBusinessUnit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            setBuModalOpen(false);
        },
    });

    const updateBuMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<BusinessUnit> }) => updateBusinessUnit(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            setBuModalOpen(false);
        },
    });

    const deleteBuMutation = useMutation({
        mutationFn: deleteBusinessUnit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            setDeleteConfirm(null);
            setDeleteError(null);
        },
        onError: (error: unknown) => {
            setDeleteError(getErrorMessage(error));
        }
    });

    // --- Product Line Mutations ---
    const createPlMutation = useMutation({
        mutationFn: createProductLine,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            queryClient.invalidateQueries({ queryKey: ['productLines'] }); // for lists
            setPlModalOpen(false);
        },
    });

    const updatePlMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<ProductLine> }) => updateProductLine(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            queryClient.invalidateQueries({ queryKey: ['productLines'] });
            setPlModalOpen(false);
        },
    });

    const deletePlMutation = useMutation({
        mutationFn: deleteProductLine,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            queryClient.invalidateQueries({ queryKey: ['productLines'] });
            setDeleteConfirm(null);
        },
    });

    // --- Project Mutations (Delete only, Create/Update handled by ProjectForm) ---
    const deleteProjectMutation = useMutation({
        mutationFn: apiDeleteProject,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            setDeleteConfirm(null);
        },
    });

    // --- Handlers ---

    // Product Line
    const handleAddProductLine = (buId: string) => {
        setPlFormData({
            name: '',
            code: '',
            business_unit_id: buId,
            line_category: 'PRODUCT',
            description: '',
        });
        setPlModalOpen(true);
    };

    const handleEditProductLine = (pl: ProductLineNode, parentBuId: string) => {
        setPlFormData({
            id: pl.id,
            name: pl.name,
            code: pl.code,
            business_unit_id: parentBuId,
            line_category: pl.line_category || 'PRODUCT',
            description: pl.description || '',
        });
        setPlModalOpen(true);
    };

    const handleSaveProductLine = () => {
        // Generate code from name if not provided (similar to Business Unit logic)
        const code = plFormData.code || plFormData.name.toUpperCase().replace(/\s+/g, '_').slice(0, 10);
        if (plFormData.id) {
            updatePlMutation.mutate({
                id: plFormData.id,
                data: {
                    name: plFormData.name,
                    code: code,
                    business_unit_id: plFormData.business_unit_id, // Allow changing parent BU
                    line_category: plFormData.line_category,
                    description: plFormData.description
                }
            });
        } else {
            createPlMutation.mutate({
                name: plFormData.name,
                code: code,
                business_unit_id: plFormData.business_unit_id,
                line_category: plFormData.line_category,
                description: plFormData.description
            });
        }
    };

    // Project
    const handleAddProject = (parentId: string, type: 'product_line' | 'department') => {
        console.log('Adding project', parentId, type);
        setEditingProject(undefined);
        if (type === 'product_line') {
            setProjectInitialValues({ product_line_id: parentId, category: 'PRODUCT' });
        } else {
            setProjectInitialValues({ owner_department_id: parentId, category: 'FUNCTIONAL' });
        }
        setProjectModalOpen(true);
    };


    const handleDelete = () => {
        if (!deleteConfirm) return;
        if (deleteConfirm.type === 'business_unit') {
            deleteBuMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === 'product_line') {
            deletePlMutation.mutate(deleteConfirm.id);
        } else if (deleteConfirm.type === 'project') {
            deleteProjectMutation.mutate(deleteConfirm.id);
        }
    };

    // --- Business Unit Handlers ---
    const handleAddBusinessUnit = () => {
        setBuFormData({ name: '', code: '', is_active: true });
        setBuModalOpen(true);
    };

    const handleEditBusinessUnit = (bu: BusinessUnitNode) => {
        setBuFormData({ id: bu.id, name: bu.name, code: bu.code, is_active: true });
        setBuModalOpen(true);
    };

    const handleSaveBusinessUnit = () => {
        const code = buFormData.code || buFormData.name.toUpperCase().replace(/\s+/g, '_').slice(0, 5);
        if (buFormData.id) {
            updateBuMutation.mutate({ id: buFormData.id, data: { name: buFormData.name, code } });
        } else {
            createBuMutation.mutate({ name: buFormData.name, code, is_active: true });
        }
    };

    if (isLoading) return <div>{t('hierarchy.loadingHierarchy')}</div>;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">{t('hierarchy.title')}</h2>
                {canManageProjects && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleAddBusinessUnit}>
                            {t('hierarchy.newBusinessUnit')}
                        </Button>
                        <Button onClick={() => handleAddProject('', 'product_line')}>
                            {t('hierarchy.newProject')}
                        </Button>
                    </div>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ProjectHierarchyTab)}>
                <TabsList>
                    <TabsTrigger value="product">{t('hierarchy.tabActive')}</TabsTrigger>
                    <TabsTrigger value="functional">{t('hierarchy.tabFunctional')}</TabsTrigger>
                    <TabsTrigger value="all">{t('hierarchy.tabAll')}</TabsTrigger>
                    <TabsTrigger value="io-management">{t('hierarchy.tabIO')}</TabsTrigger>
                </TabsList>

                <TabsContent value="product" className="mt-4">
                    {/* Ungrouped Projects Section - Only Active */}
                    {activeUngroupedProjects.length > 0 && (
                        <Card className="mb-4 border-amber-200 bg-amber-50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-amber-800 flex items-center gap-2">
                                    <span>{t('hierarchy.ungroupedTitle')}</span>
                                    <span className="text-sm font-normal text-amber-600">{t('hierarchy.ungroupedDesc', { count: activeUngroupedProjects.length })}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-1">
                                    {sortProjectsByStatus(activeUngroupedProjects).map((proj) => (
                                        <div key={proj.id} className="flex items-center gap-3 rounded border border-amber-200 bg-white px-3 py-3">
                                            <button
                                                type="button"
                                                className="min-w-0 flex-1 text-left"
                                                onClick={() => navigate(`/projects/${proj.id}`, { state: { returnTab: 'product' } })}
                                            >
                                                <p className="text-[11px] uppercase tracking-wide text-amber-700/70">
                                                    {t('hierarchy.ungroupedTitle')}
                                                </p>
                                                <div className="mt-1">
                                                    <span className="truncate font-medium text-slate-900">{proj.name}</span>
                                                </div>
                                            </button>
                                            <StatusBadge status={proj.status} />
                                            {canManageProjects && (
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8"
                                                            aria-label={`Manage project ${proj.name}`}
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onSelect={() => navigate(`/projects/${proj.id}`, { state: { returnTab: 'product' } })}>
                                                            {t('hierarchy.editToAssign')}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            className="text-red-600 focus:text-red-600"
                                                            onSelect={() => setDeleteConfirm({ type: 'project', id: proj.id, name: proj.name })}
                                                        >
                                                            {t('hierarchy.deleteProject')}
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>{t('hierarchy.productHierarchyTitle')}</CardTitle>
                            <CardDescription>{t('hierarchy.productListSubtitle')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {activeProductProjects.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center text-sm text-muted-foreground">
                                    {t('hierarchy.noActiveProductGroups')}
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {activeProductProjects.map((bu) => {
                                        const businessUnitGroups = activeProductGroups.filter(
                                            (group) => group.businessUnit.id === bu.id
                                        );
                                        const businessUnitProjectCount = businessUnitGroups.reduce(
                                            (count, group) => count + group.projects.length,
                                            0
                                        );

                                        return (
                                            <section key={bu.id} className="space-y-3" data-testid={`business-unit-group-${bu.id}`}>
                                                <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-lg font-semibold text-slate-900">{bu.name}</h3>
                                                            <span className="text-xs text-muted-foreground">({bu.code})</span>
                                                        </div>
                                                        <p className="mt-1 text-sm text-muted-foreground">
                                                            {t('hierarchy.groupSummary', {
                                                                projects: businessUnitProjectCount,
                                                                count: businessUnitGroups.length,
                                                            })}
                                                        </p>
                                                    </div>
                                                    {canManageProjects && (
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-8 w-8"
                                                                    aria-label={`Manage business unit ${bu.name}`}
                                                                >
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem onSelect={() => handleAddProductLine(bu.id)}>
                                                                    {t('hierarchy.addProductLine')}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onSelect={() => handleEditBusinessUnit(bu)}>
                                                                    {t('hierarchy.editBusinessUnit')}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    className="text-red-600 focus:text-red-600"
                                                                    onSelect={() => setDeleteConfirm({ type: 'business_unit', id: bu.id, name: bu.name })}
                                                                >
                                                                    {t('hierarchy.deleteBusinessUnit')}
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    {businessUnitGroups.map(({ productLine: pl, projects }) => (
                                                        <div
                                                            key={pl.id}
                                                            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                                                            data-testid={`product-line-group-${pl.id}`}
                                                        >
                                                            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <h4 className="font-medium text-slate-900">{pl.name}</h4>
                                                                        <span className="text-xs text-muted-foreground">({pl.code})</span>
                                                                        <Badge variant="outline">{pl.line_category || 'PRODUCT'}</Badge>
                                                                    </div>
                                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                                        {t('hierarchy.productLineSummary', { count: projects.length })}
                                                                    </p>
                                                                </div>
                                                                {canManageProjects && (
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-8 w-8"
                                                                                aria-label={`Manage product line ${pl.name}`}
                                                                            >
                                                                                <MoreHorizontal className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end">
                                                                            <DropdownMenuItem onSelect={() => handleAddProject(pl.id, 'product_line')}>
                                                                                {t('hierarchy.addProject')}
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onSelect={() => handleEditProductLine(pl, bu.id)}>
                                                                                {t('hierarchy.editProductLine')}
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem
                                                                                className="text-red-600 focus:text-red-600"
                                                                                onSelect={() => setDeleteConfirm({ type: 'product_line', id: pl.id, name: pl.name })}
                                                                            >
                                                                                {t('hierarchy.deleteProductLine')}
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                )}
                                                            </div>

                                                            <div className="divide-y divide-slate-100">
                                                                {projects.map((proj) => (
                                                                    <div
                                                                        key={proj.id}
                                                                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                                                                        data-testid={`product-row-${proj.id}`}
                                                                    >
                                                                        <button
                                                                            type="button"
                                                                            className="min-w-0 flex-1 text-left"
                                                                            onClick={() => navigate(`/projects/${proj.id}`, { state: { returnTab: 'product' } })}
                                                                        >
                                                                            <div className="mt-1">
                                                                                <span className="truncate font-medium text-slate-900">{proj.name}</span>
                                                                            </div>
                                                                        </button>
                                                                        <StatusBadge status={proj.status} />
                                                                        {canManageProjects && (
                                                                            <DropdownMenu>
                                                                                <DropdownMenuTrigger asChild>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        className="h-8 w-8"
                                                                                        aria-label={`Manage project ${proj.name}`}
                                                                                    >
                                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                                    </Button>
                                                                                </DropdownMenuTrigger>
                                                                                <DropdownMenuContent align="end">
                                                                                    <DropdownMenuItem onSelect={() => navigate(`/projects/${proj.id}`, { state: { returnTab: 'product' } })}>
                                                                                        {t('hierarchy.editProjectTitle')}
                                                                                    </DropdownMenuItem>
                                                                                    <DropdownMenuItem
                                                                                        className="text-red-600 focus:text-red-600"
                                                                                        onSelect={() => setDeleteConfirm({ type: 'project', id: proj.id, name: proj.name })}
                                                                                    >
                                                                                        {t('hierarchy.deleteProject')}
                                                                                    </DropdownMenuItem>
                                                                                </DropdownMenuContent>
                                                                            </DropdownMenu>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                                {projects.length === 0 && (
                                                                    <div className="px-4 py-6 text-sm text-muted-foreground">
                                                                        {t('hierarchy.noProjects')}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="functional" className="mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('hierarchy.functionalTitle')}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {functionalProjects.map((dept) => (
                                    <div key={dept.id} className="border rounded-lg overflow-hidden">
                                        {/* Department Row */}
                                        <div className="flex items-center justify-between p-3 bg-slate-100 hover:bg-slate-200">
                                            <div
                                                className="flex items-center gap-2 cursor-pointer flex-1"
                                                onClick={() => toggleExpand(dept.id)}
                                            >
                                                <span className="text-lg">{expandedIds.has(dept.id) ? '📂' : '📁'}</span>
                                                <span className="font-semibold">{dept.name}</span>
                                                <span className="text-xs text-muted-foreground">({dept.type})</span>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost" size="sm" className="h-8 w-8 text-green-600"
                                                    onClick={(e) => { e.stopPropagation(); handleAddProject(dept.id, 'department'); }}
                                                    title={t('hierarchy.addProject')}
                                                >
                                                    ➕
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Projects - sorted by status priority */}
                                        {expandedIds.has(dept.id) && (
                                            <div className="pl-6 py-2 bg-white space-y-1">
                                                {sortProjectsByStatus(dept.children || []).map((proj) => (
                                                    <div key={proj.id} className="flex items-center justify-between p-1.5 text-sm hover:bg-slate-50 border border-slate-100 rounded">
                                                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate(`/projects/${proj.id}`, { state: { returnTab: 'functional' } })}>
                                                            <span>🔹</span>
                                                            <span>{proj.name}</span>
                                                            <span className="text-xs text-muted-foreground">{proj.internal_io?.io_number || '-'}</span>
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${proj.status === 'Active' ? 'bg-green-100 text-green-700' :
                                                                proj.status === 'Complete' ? 'bg-gray-100 text-gray-700' :
                                                                    'bg-yellow-100 text-yellow-700'
                                                                }`}>
                                                                {proj.status}
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <Button
                                                                variant="ghost" size="sm" className="h-6 w-6 text-blue-600"
                                                                onClick={() => navigate(`/projects/${proj.id}`, { state: { returnTab: 'functional' } })}
                                                            >
                                                                ✏️
                                                            </Button>
                                                            <Button
                                                                variant="ghost" size="sm" className="h-6 w-6 text-red-600"
                                                                onClick={() => setDeleteConfirm({ type: 'project', id: proj.id, name: proj.name })}
                                                            >
                                                                🗑️
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!dept.children || dept.children.length === 0) && (
                                                    <div className="text-xs text-muted-foreground italic">{t('hierarchy.noProjects')}</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="all" className="mt-4">
                    <div className="mb-4">
                        <h2 className="text-xl font-semibold">{t('hierarchy.allProjectsCount', { count: allProjects.length })}</h2>
                    </div>
                    <ProjectInlineTable
                        projects={allProjects}
                        businessUnits={businessUnits}
                        productLines={productLines}
                        departments={departments}
                        users={users}
                        internalIOs={internalIOs}
                        rechargeIOs={rechargeIOs}
                        canManageProjects={canManageProjects}
                    />
                </TabsContent>

                {/* IO Management Tab */}
                <TabsContent value="io-management" className="mt-4">
                    <IOManagementTab />
                </TabsContent>
            </Tabs>

            {/* Business Unit Modal */}
            <Dialog open={buModalOpen} onOpenChange={setBuModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{buFormData.id ? t('hierarchy.editBU') : t('hierarchy.addBU')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="bu-name" className="text-right">{t('common:form.name')}</Label>
                            <Input
                                id="bu-name"
                                value={buFormData.name}
                                onChange={(e) => setBuFormData({ ...buFormData, name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="bu-code" className="text-right">{t('common:form.code')}</Label>
                            <Input
                                id="bu-code"
                                value={buFormData.code}
                                onChange={(e) => setBuFormData({ ...buFormData, code: e.target.value })}
                                className="col-span-3"
                                placeholder={t('hierarchy.autoGenerated')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBuModalOpen(false)}>{t('common:buttons.cancel')}</Button>
                        <Button onClick={handleSaveBusinessUnit} disabled={!buFormData.name}>{t('common:buttons.save')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Product Line Modal */}
            <Dialog open={plModalOpen} onOpenChange={setPlModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{plFormData.id ? t('hierarchy.editPL') : t('hierarchy.addPL')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pl-name" className="text-right">{t('common:form.name')}</Label>
                            <Input
                                id="pl-name"
                                value={plFormData.name}
                                onChange={(e) => setPlFormData({ ...plFormData, name: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pl-bu" className="text-right">{t('detail.businessUnit')}</Label>
                            <Select
                                value={plFormData.business_unit_id}
                                onValueChange={(v) => setPlFormData({ ...plFormData, business_unit_id: v })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder={t('hierarchy.selectBusinessUnit')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {businessUnits.map((bu) => (
                                        <SelectItem key={bu.id} value={bu.id}>{bu.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pl-category" className="text-right">{t('hierarchy.lineCategory')}</Label>
                            <Select
                                value={plFormData.line_category}
                                onValueChange={(v: ProductLineCategory) => setPlFormData({ ...plFormData, line_category: v })}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder={t('hierarchy.lineCategory')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PRODUCT">PRODUCT</SelectItem>
                                    <SelectItem value="PLATFORM">PLATFORM</SelectItem>
                                    <SelectItem value="LEGACY">LEGACY</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pl-desc" className="text-right">{t('common:form.description')}</Label>
                            <Input
                                id="pl-desc"
                                value={plFormData.description}
                                onChange={(e) => setPlFormData({ ...plFormData, description: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPlModalOpen(false)}>{t('common:buttons.cancel')}</Button>
                        <Button onClick={handleSaveProductLine} disabled={!plFormData.name}>{t('common:buttons.save')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Project Modal */}
            <Dialog open={projectModalOpen} onOpenChange={setProjectModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            {editingProject ? t('hierarchy.editProjectTitle') : t('hierarchy.addProjectTitle')}
                        </DialogTitle>
                    </DialogHeader>
                    <ProjectForm
                        project={editingProject}
                        initialValues={projectInitialValues}
                        onSuccess={() => {
                            setProjectModalOpen(false);
                            queryClient.invalidateQueries({ queryKey: ['project-hierarchy'] });
                        }}
                        onCancel={() => setProjectModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) { setDeleteConfirm(null); setDeleteError(null); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('hierarchy.confirmDelete')}</DialogTitle>
                        <DialogDescription>
                            {t('hierarchy.confirmDeleteMessage', { type: deleteConfirm?.type === 'business_unit' ? t('hierarchy.typeBusinessUnit') : deleteConfirm?.type === 'product_line' ? t('hierarchy.typeProductLine') : t('hierarchy.typeProject'), name: deleteConfirm?.name })}
                            {deleteConfirm?.type === 'product_line' && ` ${t('hierarchy.confirmDeleteOrphanWarning')}`}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                            ⚠️ {deleteError}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}>{t('common:buttons.cancel')}</Button>
                        <Button variant="destructive" onClick={handleDelete}>{t('common:buttons.delete')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ProjectHierarchyEditor;
