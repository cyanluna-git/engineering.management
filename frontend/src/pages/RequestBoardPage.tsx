import { useState } from 'react'
import { JiraRequestForm } from '@/components/JiraRequestForm'
import { JiraTicketQueue } from '@/components/JiraTicketQueue'
import { JiraTicketStats } from '@/components/JiraTicketStats'

type Tab = 'queue' | 'stats' | 'form'

export function RequestBoardPage() {
    const [activeTab, setActiveTab] = useState<Tab>('queue')
    return (
        <div className="flex h-full flex-col bg-gray-50 px-6 py-5">
            <div className="mb-4 shrink-0 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                <h1 className="text-lg font-semibold text-gray-900">요청 게시판</h1>
                <p className="mt-1 text-sm text-gray-500">Jira 이슈를 확인하거나 새 요청을 제출하세요.</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="shrink-0 border-b border-gray-200 px-4">
                    <nav className="-mb-px flex gap-1">
                        {(['queue', 'stats', 'form'] as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setActiveTab(tab)}
                                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                                }`}
                            >
                                {tab === 'queue' ? '티켓 현황' : tab === 'stats' ? '통계' : '요청 제출'}
                            </button>
                        ))}
                    </nav>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                    {activeTab === 'queue' && <JiraTicketQueue />}
                    {activeTab === 'stats' && <JiraTicketStats />}
                    {activeTab === 'form' && (
                        <div className="overflow-y-auto p-6 h-full">
                            <div className="mx-auto max-w-2xl">
                                <JiraRequestForm />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
