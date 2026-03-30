import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGuide } from "@/hooks/useGuides";

const markdownClassName =
  "prose prose-slate max-w-none prose-headings:tracking-tight prose-a:text-red-600 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-slate-900 prose-pre:text-slate-100";

export function GuideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: guide, isLoading } = useGuide(id || "");

  if (isLoading) {
    return (
      <div className="py-20 text-center text-sm text-slate-400">Loading...</div>
    );
  }

  if (!guide) {
    return (
      <div className="py-20 text-center text-sm text-slate-400">
        Guide not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <Link
        to="/guides"
        className="flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-red-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Guides
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {guide.category}
          </span>
          <span className="text-xs text-slate-400">
            Updated {new Date(guide.updated_at).toLocaleDateString()} by{" "}
            {guide.author}
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          {guide.title}
        </h1>
      </div>

      <div className={markdownClassName}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {guide.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default GuideDetailPage;
