import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createJiraRequest, getApiError } from '@/api/client'

const MAX_SUMMARY_LEN = 255
const MAX_FILE_BYTES = 10 * 1024 * 1024

interface FormState {
    summary: string
    description: string
    file: File | null
}

const EMPTY_FORM: FormState = { summary: '', description: '', file: null }

export function JiraRequestForm() {
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [submitting, setSubmitting] = useState(false)
    const [successKey, setSuccessKey] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null
        if (f && f.size > MAX_FILE_BYTES) {
            setError('파일 크기는 10MB 이하여야 합니다.')
            e.target.value = ''
            return
        }
        setError(null)
        setForm(prev => ({ ...prev, file: f }))
    }

    const removeFile = () => {
        setForm(prev => ({ ...prev, file: null }))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.summary.trim()) return

        setSubmitting(true)
        setError(null)
        setSuccessKey(null)

        const fd = new FormData()
        fd.append('summary', form.summary.trim())
        if (form.description.trim()) fd.append('description', form.description.trim())
        if (form.file) fd.append('file', form.file)

        try {
            const result = await createJiraRequest(fd)
            setSuccessKey(result.issue_key)
            setForm(EMPTY_FORM)
            if (fileInputRef.current) fileInputRef.current.value = ''
        } catch (err) {
            const apiErr = getApiError(err)
            setError(apiErr.message || '요청 제출에 실패했습니다. 다시 시도해주세요.')
        } finally {
            setSubmitting(false)
        }
    }

    const summaryLen = form.summary.length

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {successKey && (
                <Alert className="border-green-500 bg-green-50 text-green-800">
                    <AlertDescription>
                        요청이 제출되었습니다. Jira 티켓 번호: <strong>{successKey}</strong>
                    </AlertDescription>
                </Alert>
            )}
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-1.5">
                <Label htmlFor="summary">
                    제목 <span className="text-red-500">*</span>
                </Label>
                <Input
                    id="summary"
                    value={form.summary}
                    onChange={e => setForm(prev => ({ ...prev, summary: e.target.value.slice(0, MAX_SUMMARY_LEN) }))}
                    placeholder="요청 제목을 입력하세요"
                    required
                    maxLength={MAX_SUMMARY_LEN}
                />
                <p className="text-right text-xs text-slate-400">{summaryLen} / {MAX_SUMMARY_LEN}</p>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="description">상세 내용</Label>
                <Textarea
                    id="description"
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="요청 내용을 상세히 입력하세요 (선택)"
                    rows={5}
                />
            </div>

            <div className="space-y-1.5">
                <Label>첨부파일 (선택, 최대 10MB)</Label>
                {form.file ? (
                    <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <span className="flex-1 truncate">{form.file.name}</span>
                        <button
                            type="button"
                            onClick={removeFile}
                            className="text-slate-400 hover:text-red-500"
                        >
                            ✕
                        </button>
                    </div>
                ) : (
                    <Input
                        ref={fileInputRef}
                        type="file"
                        onChange={handleFileChange}
                        className="cursor-pointer"
                    />
                )}
            </div>

            <Button
                type="submit"
                disabled={submitting || !form.summary.trim()}
                className="w-full"
            >
                {submitting ? '제출 중...' : '요청 제출'}
            </Button>
        </form>
    )
}
