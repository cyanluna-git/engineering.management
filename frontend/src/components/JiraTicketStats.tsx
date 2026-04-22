import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listJiraRequests } from '@/api/client'
import type { JiraTicket } from '@/types'

const PRIORITY_ORDER = ['Highest', 'High', 'Medium', 'Low', 'Lowest']

const PRIORITY_STYLES: Record<string, string> = {
    Highest: 'bg-red-100 text-red-700',
    High: 'bg-orange-100 text-orange-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    Low: 'bg-blue-100 text-blue-700',
    Lowest: 'bg-gray-100 text-gray-500',
}

interface StatCardProps {
    label: string
    value: number
    total: number
    color: string
}

function StatCard({ label, value, total, color }: StatCardProps) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-400">{pct}%</p>
        </div>
    )
}

function BarRow({
    label,
    value,
    max,
    colorClass,
}: {
    label: string
    value: number
    max: number
    colorClass: string
}) {
    const pct = max > 0 ? (value / max) * 100 : 0
    return (
        <div className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-right text-xs text-gray-500">{label}</span>
            <div className="flex-1 overflow-hidden rounded-full bg-gray-100 h-3">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 shrink-0 text-xs font-medium text-gray-700">{value}</span>
        </div>
    )
}

export function JiraTicketStats() {
    const [tickets, setTickets] = useState<JiraTicket[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchTickets = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setTickets(await listJiraRequests())
        } catch (err) {
            setError(err instanceof Error ? err.message : '티켓을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchTickets()
    }, [fetchTickets])

    const total = tickets.length
    const open = tickets.filter((t) => t.status_category === 'new').length
    const inProgress = tickets.filter((t) => t.status_category === 'indeterminate').length
    const done = tickets.filter((t) => t.status_category === 'done').length

    const byStatus = tickets.reduce<Record<string, number>>((acc, t) => {
        acc[t.status] = (acc[t.status] ?? 0) + 1
        return acc
    }, {})
    const maxStatus = Math.max(...Object.values(byStatus), 1)

    const byPriority = tickets.reduce<Record<string, number>>((acc, t) => {
        const p = t.priority ?? 'Unknown'
        acc[p] = (acc[p] ?? 0) + 1
        return acc
    }, {})
    const priorityEntries = PRIORITY_ORDER.filter((p) => byPriority[p] != null).map((p) => ({
        label: p,
        value: byPriority[p],
    }))
    const maxPriority = Math.max(...priorityEntries.map((e) => e.value), 1)

    if (loading && tickets.length === 0) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center px-6">
                <p className="text-sm text-red-500">{error}</p>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col overflow-y-auto px-6 py-5">
            <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">티켓 통계</p>
                <Button type="button" variant="outline" size="sm" onClick={fetchTickets} disabled={loading}>
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    새로고침
                </Button>
            </div>

            {total === 0 ? (
                <p className="text-sm text-gray-400">티켓 데이터가 없습니다.</p>
            ) : (
                <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <StatCard label="전체" value={total} total={total} color="bg-blue-600" />
                        <StatCard label="대기" value={open} total={total} color="bg-blue-500" />
                        <StatCard label="진행 중" value={inProgress} total={total} color="bg-yellow-400" />
                        <StatCard label="완료" value={done} total={total} color="bg-green-500" />
                    </div>

                    {/* By status */}
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                            상태별
                        </p>
                        <div className="space-y-2">
                            {Object.entries(byStatus)
                                .sort((a, b) => b[1] - a[1])
                                .map(([s, count]) => (
                                    <BarRow
                                        key={s}
                                        label={s}
                                        value={count}
                                        max={maxStatus}
                                        colorClass="bg-blue-500/70"
                                    />
                                ))}
                        </div>
                    </div>

                    {/* By priority */}
                    {priorityEntries.length > 0 && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-4">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                                우선순위별
                            </p>
                            <div className="space-y-2">
                                {priorityEntries.map(({ label, value }) => (
                                    <div key={label} className="flex items-center gap-3">
                                        <span
                                            className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${PRIORITY_STYLES[label] ?? 'bg-gray-100 text-gray-500'}`}
                                        >
                                            {label}
                                        </span>
                                        <div className="flex-1 overflow-hidden rounded-full bg-gray-100 h-3">
                                            <div
                                                className={`h-full rounded-full ${PRIORITY_STYLES[label]?.split(' ')[0] ?? 'bg-gray-300'}`}
                                                style={{ width: `${(value / maxPriority) * 100}%` }}
                                            />
                                        </div>
                                        <span className="w-6 shrink-0 text-xs font-medium text-gray-700">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default JiraTicketStats
