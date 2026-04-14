import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, LogIn } from 'lucide-react';

import { exchangeGatewayLogin, getApiError } from '@/api/client';
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/hooks/useAuth';
import { withBasePath } from '@/lib/base-path';

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://pcas-portal.atlascopco.group';

function normalizeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export function GatewayLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'failed'>('working');
  const [error, setError] = useState<string | null>(null);

  const handoffToken = searchParams.get('handoff');
  const returnTo = useMemo(
    () => normalizeReturnTo(searchParams.get('returnTo')),
    [searchParams],
  );

  useEffect(() => {
    if (!handoffToken) {
      setStatus('failed');
      setError('Missing portal handoff token.');
      return;
    }

    let cancelled = false;

    const runExchange = async () => {
      try {
        const response = await exchangeGatewayLogin(handoffToken);
        if (cancelled) {
          return;
        }

        localStorage.setItem(AUTH_TOKEN_KEY, response.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
        window.location.replace(withBasePath(returnTo));
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        const apiError = getApiError(err);
        setStatus('failed');
        setError(apiError.message);
      }
    };

    void runExchange();

    return () => {
      cancelled = true;
    };
  }, [handoffToken, returnTo, navigate]);

  if (status === 'working') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <h1 className="mt-6 text-2xl font-bold text-slate-800">
            Signing in from PCAS Portal
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Exchanging your portal handoff token for an EOB-local session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/60 bg-white p-8 shadow-xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-slate-800">
          Portal handoff could not be completed
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {error || 'The portal-issued handoff token was missing, invalid, expired, or already used.'}
        </p>
        <div className="mt-6 grid gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <LogIn className="h-4 w-4" />
            Continue to EOB login
          </Link>
          <a
            href={PORTAL_URL}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to PCAS Portal
          </a>
        </div>
      </div>
    </div>
  );
}

export default GatewayLoginPage;
