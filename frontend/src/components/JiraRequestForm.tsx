import { useCallback, useMemo, useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { createJiraRequest, getApiError } from '@/api/client'

const MAX_SUMMARY_LEN = 255
const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10 MB per file
const MAX_TOTAL_BYTES = 25 * 1024 * 1024  // 25 MB aggregate

interface FormState {
    summary: string
    description: string
    files: File[]
}

const EMPTY_FORM: FormState = { summary: '', description: '', files: [] }

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function JiraRequestForm() {
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [submitting, setSubmitting] = useState(false)
    const [successKey, setSuccessKey] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const totalBytes = useMemo(() => form.files.reduce((sum, f) => sum + f.size, 0), [form.files])

    const handleAddFiles = useCallback((incoming: FileList | null) => {
        if (!incoming || incoming.length === 0) return

        setForm(prev => {
            const next = [...prev.files]
            let running = prev.files.reduce((sum, f) => sum + f.size, 0)
            let newError: string | null = null

            for (const file of Array.from(incoming)) {
                if (file.size > MAX_FILE_BYTES) {
                    newError = `"${file.name}" 파일이 10MB 제한을 초과합니다.`
                    continue
                }
                if (running + file.size > MAX_TOTAL_BYTES) {
                    newError = '첨부파일 합계 크기가 25MB를 초과할 수 없습니다.'
                    break
                }
                running += file.size
                next.push(file)
            }

            if (newError) setError(newError)
            return { ...prev, files: next }
        })

        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const imageFiles = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'))
        if (imageFiles.length > 0) {
            e.preventDefault()
            handleAddFiles(e.clipboardData.files)
        }
    }, [handleAddFiles])

    const removeFile = useCallback((index: number) => {
        setForm(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== index) }))
    }, [])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!form.summary.trim()) return

        setSubmitting(true)
        setError(null)
        setSuccessKey(null)

        const fd = new FormData()
        fd.append('summary', form.summary.trim())
        if (form.description.trim()) fd.append('description', form.description.trim())
        for (const file of form.files) fd.append('files', file)

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
                <p className="text-right text-xs text-slate-400">{form.summary.length} / {MAX_SUMMARY_LEN}</p>
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="description">상세 내용</Label>
                <Textarea
                    id="description"
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                    onPaste={handlePaste}
                    placeholder="요청 내용을 상세히 입력하세요 (선택)"
                    rows={10}
                    className="min-h-[220px] resize-y"
                />
                <p className="text-xs text-slate-400">이미지를 Ctrl+V로 붙여넣기 할 수 있습니다.</p>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>첨부파일 (선택, 파일당 10MB · 합계 25MB)</Label>
                    {form.files.length > 0 && (
                        <span className="text-xs text-slate-400">{formatBytes(totalBytes)} / {formatBytes(MAX_TOTAL_BYTES)}</span>
                    )}
                </div>

                <div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={e => handleAddFiles(e.target.files)}
                        className="hidden"
                        id="jira-attachments"
                        disabled={submitting}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={submitting}
                    >
                        <Paperclip className="mr-2 h-4 w-4" />
                        파일 선택
                    </Button>
                </div>

                {form.files.length > 0 && (
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
                        {form.files.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="flex items-center justify-between px-3 py-2 text-sm">
                                <div className="flex min-w-0 items-center gap-3 pr-2">
                                    {file.type.startsWith('image/') ? (
                                        <img
                                            src={URL.createObjectURL(file)}
                                            alt={file.name}
                                            className="h-10 w-10 shrink-0 rounded object-cover ring-1 ring-slate-200"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-slate-100">
                                            <Paperclip className="h-4 w-4 text-slate-400" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-800">{file.name}</p>
                                        <p className="text-xs text-slate-400">{formatBytes(file.size)}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeFile(index)}
                                    className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    disabled={submitting}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
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
