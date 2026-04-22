import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getJiraRequest } from '@/api/client'
import type { JiraTicketDetail } from '@/types'

const JIRA_BASE = 'https://ac-avi.atlassian.net/browse/'

const STATUS_STYLES: Record<string, string> = {
    new: 'bg-blue-100 text-blue-700',
    indeterminate: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
}

function formatDateLong(iso: string): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

// ── Minimal ADF → React renderer ─────────────────────────────────────────────

interface AdfMark {
    type: string
    attrs?: Record<string, string>
}

interface AdfNode {
    type: string
    text?: string
    content?: AdfNode[]
    marks?: AdfMark[]
    attrs?: Record<string, unknown>
}

function applyMarks(text: React.ReactNode, marks: AdfMark[]): React.ReactNode {
    return marks.reduce<React.ReactNode>((node, mark) => {
        switch (mark.type) {
            case 'strong':
                return <strong>{node}</strong>
            case 'em':
                return <em>{node}</em>
            case 'underline':
                return <u>{node}</u>
            case 'strike':
                return <s>{node}</s>
            case 'code':
                return <code className="rounded bg-gray-100 px-1 font-mono text-xs">{node}</code>
            case 'link':
                return (
                    <a
                        href={mark.attrs?.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                    >
                        {node}
                    </a>
                )
            default:
                return node
        }
    }, text)
}

function renderAdf(node: AdfNode, key: number | string = 0): React.ReactNode {
    switch (node.type) {
        case 'doc':
            return (
                <div key={key} className="space-y-2 text-sm text-gray-800">
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </div>
            )
        case 'paragraph':
            return (
                <p key={key} className="leading-relaxed">
                    {node.content?.map((child, i) => renderAdf(child, i)) ?? <>&nbsp;</>}
                </p>
            )
        case 'text': {
            const text: React.ReactNode = node.text ?? ''
            return (
                <span key={key}>
                    {node.marks?.length ? applyMarks(text, node.marks) : text}
                </span>
            )
        }
        case 'hardBreak':
            return <br key={key} />
        case 'rule':
            return <hr key={key} className="my-3 border-gray-200" />
        case 'heading': {
            const level = (node.attrs?.level as number) ?? 2
            const cls = [
                '',
                'text-xl font-bold',
                'text-lg font-bold',
                'text-base font-semibold',
                'text-sm font-semibold',
                'text-sm font-medium',
                'text-xs font-medium',
            ][level] ?? 'font-semibold'
            return (
                <div key={key} className={`mt-3 mb-1 ${cls}`}>
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </div>
            )
        }
        case 'bulletList':
            return (
                <ul key={key} className="list-disc space-y-0.5 pl-5">
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </ul>
            )
        case 'orderedList':
            return (
                <ol key={key} className="list-decimal space-y-0.5 pl-5">
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </ol>
            )
        case 'listItem':
            return (
                <li key={key}>
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </li>
            )
        case 'blockquote':
            return (
                <blockquote key={key} className="border-l-4 border-gray-300 pl-3 text-gray-600 italic">
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </blockquote>
            )
        case 'codeBlock':
            return (
                <pre key={key} className="overflow-x-auto rounded bg-gray-100 p-3 font-mono text-xs">
                    {node.content?.map((child, i) => renderAdf(child, i))}
                </pre>
            )
        case 'mention':
            return (
                <span key={key} className="font-medium text-blue-600">
                    @{(node.attrs?.text as string) ?? (node.attrs?.id as string) ?? ''}
                </span>
            )
        case 'emoji':
            return <span key={key}>{(node.attrs?.text as string) ?? ''}</span>
        default:
            if (node.content) {
                return <span key={key}>{node.content.map((child, i) => renderAdf(child, i))}</span>
            }
            return null
    }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface JiraTicketModalProps {
    issueKey: string
    onClose: () => void
}

export function JiraTicketModal({ issueKey, onClose }: JiraTicketModalProps) {
    const [detail, setDetail] = useState<JiraTicketDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        getJiraRequest(issueKey)
            .then((data) => {
                if (!cancelled) {
                    setDetail(data)
                    setLoading(false)
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : '불러오기 실패.')
                    setLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
    }, [issueKey])

    const handleBackdropClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (e.target === e.currentTarget) onClose()
        },
        [onClose],
    )

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={handleBackdropClick}
        >
            <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-6 py-4">
                    <a
                        href={`${JIRA_BASE}${issueKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-blue-600 hover:underline"
                    >
                        {issueKey}
                    </a>
                    {detail && (
                        <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[detail.status_category] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                            {detail.status}
                        </span>
                    )}
                    <div className="flex-1" />
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => window.open(`${JIRA_BASE}${issueKey}`, '_blank')}
                    >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Jira에서 열기
                    </Button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        aria-label="닫기"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                {loading ? (
                    <div className="flex flex-1 items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                ) : error ? (
                    <div className="flex flex-1 items-center justify-center py-16">
                        <p className="text-sm text-red-500">{error}</p>
                    </div>
                ) : detail ? (
                    <div className="grid min-h-0 flex-1 grid-cols-[1fr_220px] overflow-hidden">
                        {/* Left — summary + description */}
                        <div className="flex flex-col overflow-y-auto border-r border-gray-100 px-6 py-5">
                            <h2 className="mb-4 text-base font-semibold text-gray-900">{detail.summary}</h2>
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                                설명
                            </p>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                                {detail.description
                                    ? renderAdf(detail.description as AdfNode)
                                    : <p className="text-sm text-gray-400 italic">설명 없음.</p>
                                }
                            </div>
                        </div>

                        {/* Right — metadata */}
                        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
                            <MetaField label="우선순위">
                                <span className="text-sm text-gray-800">{detail.priority ?? '—'}</span>
                            </MetaField>

                            <MetaField label="담당자">
                                <Avatar name={detail.assignee_name} url={detail.assignee_avatar} />
                            </MetaField>

                            <MetaField label="보고자">
                                <Avatar name={detail.reporter_name} url={detail.reporter_avatar} />
                            </MetaField>

                            <MetaField label="날짜">
                                <p className="text-xs text-gray-500">
                                    생성:{' '}
                                    <span className="text-gray-700">{formatDateLong(detail.created)}</span>
                                </p>
                                <p className="text-xs text-gray-500">
                                    수정:{' '}
                                    <span className="text-gray-700">{formatDateLong(detail.updated)}</span>
                                </p>
                            </MetaField>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    )
}

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
            {children}
        </div>
    )
}

function Avatar({ name, url }: { name: string | null; url: string | null }) {
    if (!name) return <span className="text-sm text-gray-400">—</span>
    return (
        <div className="flex items-center gap-2">
            {url ? (
                <img src={url} alt={name} className="h-6 w-6 rounded-full object-cover" />
            ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
                    {name[0]?.toUpperCase()}
                </div>
            )}
            <span className="text-sm text-gray-800">{name}</span>
        </div>
    )
}

export default JiraTicketModal
