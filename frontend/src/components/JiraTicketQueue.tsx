import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listJiraRequests } from '@/api/client'
import type { JiraTicket } from '@/types'
import { JiraTicketModal } from '@/components/JiraTicketModal'

const STATUS_STYLES: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    indeterminate: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
}

const PRIORITY_STYLES: Record<string, string> = {
    Highest: 'text-red-600',
    High: 'text-orange-500',
    Medium: 'text-yellow-500',
    Low: 'text-blue-400',
    Lowest: 'text-gray-400',
}

const JIRA_BASE = 'https://ac-avi.atlassian.net/browse/'

function formatDate(iso: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    })
}

export function JiraTicketQueue() {
    const [tickets, setTickets] = useState<JiraTicket[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)

    const fetchTickets = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await listJiraRequests()
            setTickets(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : '티켓을 불러오지 못했습니다.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchTickets()
    }, [fetchTickets])

    return (
        <>
            {selectedKey && (
                <JiraTicketModal issueKey={selectedKey} onClose={() => setSelectedKey(null)} />
            )}
            <div className="flex h-full flex-col overflow-hidden">
                <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-3">
                    <p className="text-sm text-gray-500">
                        component &quot;eob&quot; Jira 이슈 목록입니다.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchTickets}
                        disabled={loading}
                    >
                        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                        새로고침
                    </Button>
                </div>

                {loading && tickets.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : error ? (
                    <div className="flex flex-1 items-center justify-center px-6">
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                ) : tickets.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-6">
                        <p className="text-sm text-gray-400">티켓이 없습니다.</p>
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-gray-50">
                                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                                    <th className="px-4 py-2.5">키</th>
                                    <th className="px-4 py-2.5">요약</th>
                                    <th className="px-4 py-2.5">상태</th>
                                    <th className="px-4 py-2.5">우선순위</th>
                                    <th className="px-4 py-2.5">보고자</th>
                                    <th className="px-4 py-2.5">담당자</th>
                                    <th className="px-4 py-2.5">생성일</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {tickets.map((ticket) => (
                                    <tr key={ticket.key} className="hover:bg-gray-50">
                                        <td className="whitespace-nowrap px-4 py-2.5">
                                            <a
                                                href={`${JIRA_BASE}${ticket.key}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                                            >
                                                {ticket.key}
                                                <ExternalLink className="h-3 w-3 opacity-60" />
                                            </a>
                                        </td>
                                        <td className="max-w-xs px-4 py-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedKey(ticket.key)}
                                                className="line-clamp-2 text-left text-gray-800 hover:text-blue-600 hover:underline"
                                            >
                                                {ticket.summary}
                                            </button>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5">
                                            <span
                                                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[ticket.status_category] ?? 'bg-gray-100 text-gray-600'}`}
                                            >
                                                {ticket.status}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5">
                                            <span
                                                className={`text-xs font-medium ${PRIORITY_STYLES[ticket.priority ?? ''] ?? 'text-gray-500'}`}
                                            >
                                                {ticket.priority ?? '—'}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                                            {ticket.reporter_name || '—'}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">
                                            {ticket.assignee_name ?? '—'}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                                            {formatDate(ticket.created)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    )
}

export default JiraTicketQueue
