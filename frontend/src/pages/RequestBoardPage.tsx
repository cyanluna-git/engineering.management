import { JiraRequestForm } from '@/components/JiraRequestForm'

export function RequestBoardPage() {
    return (
        <div className="flex h-full flex-col bg-slate-100">
            <div className="flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-2xl">
                    <div className="mb-6">
                        <h1 className="text-2xl font-semibold text-slate-800">요청 게시판</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            시스템 오류, 개선 요청, 문의 사항을 Jira로 제출하세요.
                        </p>
                    </div>
                    <div className="rounded-lg bg-white p-6 shadow-sm">
                        <JiraRequestForm />
                    </div>
                </div>
            </div>
        </div>
    )
}
