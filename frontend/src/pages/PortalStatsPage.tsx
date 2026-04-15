import { useCallback, useEffect, useRef, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { apiClient } from '@/api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { ArrowLeft, Users, Activity, BarChart3, Clock, Container, Cpu, HardDrive, Wifi, AlertTriangle, Server, Database } from 'lucide-react';
import type { ContainerInfo, ContainerMonitoringResponse, ServerStats } from '@/types';

interface TopUser {
  user_id: string;
  name: string;
  count: number;
}

interface HourlyActivity {
  hour: number;
  count: number;
}

interface PortalStats {
  service_counts: Record<string, number>;
  top_users: TopUser[];
  hourly_activity: HourlyActivity[];
}

const SERVICE_COLORS: Record<string, string> = {
  eob: '#2563eb',
  oqc: '#059669',
  jarvis: '#7c3aed',
  testrig: '#d97706',
};

const SERVICE_LABELS: Record<string, string> = {
  eob: 'EOB Dashboard',
  oqc: 'OQC',
  jarvis: 'Jarvis',
  testrig: 'TestRig',
};

type TabKey = 'usage' | 'containers';

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://pcas-portal.atlascopco.group';

export default function PortalStatsPage() {
  const { isAdmin } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabKey>('usage');

  if (!isAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg text-slate-500">Access denied.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.assign(PORTAL_URL)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-500">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Portal Statistics</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <TabButton active={activeTab === 'usage'} onClick={() => setActiveTab('usage')}>
          <BarChart3 className="h-4 w-4" />
          Portal Usage
        </TabButton>
        <TabButton active={activeTab === 'containers'} onClick={() => setActiveTab('containers')}>
          <Container className="h-4 w-4" />
          Container Monitoring
        </TabButton>
      </div>

      {/* Tab Content */}
      {activeTab === 'usage' && <PortalUsageTab />}
      {activeTab === 'containers' && <ContainerMonitoringTab />}
    </div>
  );
}

/* ─── Tab Button ─────────────────────────────────────────── */

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Portal Usage Tab (existing content) ────────────────── */

function PortalUsageTab() {
  const [stats, setStats] = useState<PortalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/portal/stats')
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.response?.data?.detail || 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <p className="text-lg text-red-500">{error || 'No data'}</p>
        <button onClick={() => window.location.assign(PORTAL_URL)} className="text-sm text-slate-500 underline">
          Back to Portal
        </button>
      </div>
    );
  }

  const totalAccess = Object.values(stats.service_counts).reduce((a, b) => a + b, 0);

  const pieData = Object.entries(stats.service_counts).map(([key, value]) => ({
    name: SERVICE_LABELS[key] || key,
    value,
    color: SERVICE_COLORS[key] || '#94a3b8',
  }));

  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const found = stats.hourly_activity.find((h) => h.hour === i);
    return { hour: `${i.toString().padStart(2, '0')}:00`, count: found?.count || 0 };
  });

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-500">Last 30 days</p>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<Activity className="h-5 w-5" />} label="Total Access" value={totalAccess} color="text-red-500" bg="bg-red-50" />
        <SummaryCard icon={<BarChart3 className="h-5 w-5" />} label="Services Used" value={Object.keys(stats.service_counts).length} color="text-blue-500" bg="bg-blue-50" />
        <SummaryCard icon={<Users className="h-5 w-5" />} label="Active Users" value={stats.top_users.length} color="text-emerald-500" bg="bg-emerald-50" />
        <SummaryCard icon={<Clock className="h-5 w-5" />} label="Peak Hour" value={getPeakHour(stats.hourly_activity)} color="text-amber-500" bg="bg-amber-50" isText />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Service Usage Pie */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Service Usage</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Activity Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Hourly Activity (UTC)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={2} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Users Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Top Users</h2>
        {stats.top_users.length === 0 ? (
          <p className="text-sm text-slate-400">No data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 text-right">Access Count</th>
                  <th className="pb-3 pl-6">Share</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_users.map((u, i) => (
                  <tr key={u.user_id} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-slate-400">{i + 1}</td>
                    <td className="py-3 pr-4 font-medium text-slate-800">{u.name || u.user_id}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">{u.count}</td>
                    <td className="py-3 pl-6">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{ width: `${totalAccess ? (u.count / totalAccess) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">
                          {totalAccess ? Math.round((u.count / totalAccess) * 100) : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Container Monitoring Tab ───────────────────────────── */

function getThresholdColor(percent: number): string {
  if (percent > 80) return '#ef4444';
  if (percent > 60) return '#f59e0b';
  return '#10b981';
}

function getThresholdClass(percent: number): string {
  if (percent > 80) return 'bg-red-500';
  if (percent > 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getThresholdTextClass(percent: number): string {
  if (percent > 80) return 'text-red-500';
  if (percent > 60) return 'text-amber-500';
  return 'text-emerald-500';
}

function ContainerMonitoringTab() {
  const [data, setData] = useState<ContainerMonitoringResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchContainers = useCallback(() => {
    apiClient.get('/portal/containers')
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'Failed to load containers');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchContainers();
    intervalRef.current = setInterval(fetchContainers, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchContainers]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-amber-400" />
        <p className="text-lg font-medium text-slate-700">Docker not available</p>
        <p className="text-sm text-slate-400">{error}</p>
      </div>
    );
  }

  if (!data || data.stacks.length === 0) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <Container className="h-12 w-12 text-slate-300" />
        <p className="text-lg font-medium text-slate-500">No containers found</p>
      </div>
    );
  }

  const { server_stats, stacks } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Auto-refreshes every 30 seconds</p>
        <button
          onClick={fetchContainers}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          Refresh now
        </button>
      </div>

      {/* Server Resource Cards */}
      <ServerResourceCards stats={server_stats} />

      {/* Stack Sections */}
      {stacks.map((stack) => (
        <StackSection key={stack.name} stack={stack} />
      ))}
    </div>
  );
}

/* ─── Server Resource Cards ──────────────────────────────── */

function ServerResourceCards({ stats }: { stats: ServerStats }) {
  const memPercent = stats.memory_total_mb > 0
    ? (stats.memory_used_mb / stats.memory_total_mb) * 100
    : 0;
  const diskPercent = stats.disk_total_gb > 0
    ? (stats.disk_used_gb / stats.disk_total_gb) * 100
    : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* CPU */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU</p>
            <p className={`text-xl font-semibold tracking-tight ${getThresholdTextClass(stats.cpu_percent)}`}>
              {stats.cpu_percent.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(stats.cpu_percent, 100)}%`,
              backgroundColor: getThresholdColor(stats.cpu_percent),
            }}
          />
        </div>
      </div>

      {/* Memory */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Memory</p>
            <p className={`text-xl font-semibold tracking-tight ${getThresholdTextClass(memPercent)}`}>
              {memPercent.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(memPercent, 100)}%`,
              backgroundColor: getThresholdColor(memPercent),
            }}
          />
        </div>
        <p className="text-xs text-slate-400">
          {stats.memory_used_mb.toLocaleString()} / {stats.memory_total_mb.toLocaleString()} MB
        </p>
      </div>

      {/* Disk */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Disk</p>
            <p className={`text-xl font-semibold tracking-tight ${getThresholdTextClass(diskPercent)}`}>
              {diskPercent.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(diskPercent, 100)}%`,
              backgroundColor: getThresholdColor(diskPercent),
            }}
          />
        </div>
        <p className="text-xs text-slate-400">
          {stats.disk_used_gb.toFixed(1)} / {stats.disk_total_gb.toFixed(1)} GB
        </p>
      </div>

      {/* Network */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Network</p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-xs text-slate-400">Received</p>
            <p className="font-semibold text-slate-800">{stats.network_rx_mb.toFixed(1)} MB</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Sent</p>
            <p className="font-semibold text-slate-800">{stats.network_tx_mb.toFixed(1)} MB</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Stack Section ──────────────────────────────────────── */

function StackSection({ stack }: { stack: { name: string; containers: ContainerInfo[] } }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-900">{stack.name}</h3>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {stack.containers.length}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stack.containers.map((c) => (
          <ContainerCard key={c.name} container={c} />
        ))}
      </div>
    </div>
  );
}

/* ─── Container Card ─────────────────────────────────────── */

function ContainerCard({ container }: { container: ContainerInfo }) {
  const memPercent = container.memory_limit_mb > 0
    ? (container.memory_usage_mb / container.memory_limit_mb) * 100
    : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Header: Name + Status */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 truncate">{container.name}</h3>
        <StatusBadge status={container.status} />
      </div>

      {/* CPU */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
          <Cpu className="h-3.5 w-3.5" />
          <span>CPU</span>
          <span className="ml-auto font-semibold text-slate-800">{container.cpu_percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${getThresholdClass(container.cpu_percent)}`}
            style={{ width: `${Math.min(container.cpu_percent, 100)}%` }}
          />
        </div>
      </div>

      {/* Memory */}
      <div className="mb-3">
        <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
          <HardDrive className="h-3.5 w-3.5" />
          <span>Memory</span>
          <span className="ml-auto font-semibold text-slate-800">
            {container.memory_usage_mb} / {container.memory_limit_mb} MB
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${getThresholdClass(memPercent)}`}
            style={{ width: `${Math.min(memPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Network + Uptime */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <Wifi className="h-3.5 w-3.5" />
          <span>{container.network_rx_mb} MB in / {container.network_tx_mb} MB out</span>
        </div>
        <span>{formatUptime(container.uptime_seconds)}</span>
      </div>
    </div>
  );
}

/* ─── Status Badge ───────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    exited: 'bg-red-50 text-red-700 border-red-200',
    paused: 'bg-amber-50 text-amber-700 border-amber-200',
    restarting: 'bg-amber-50 text-amber-700 border-amber-200',
    created: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  const colorClass = colors[status] || 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${colorClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === 'running' ? 'bg-emerald-500' :
        status === 'exited' ? 'bg-red-500' :
        status === 'paused' || status === 'restarting' ? 'bg-amber-500' :
        'bg-slate-400'
      }`} />
      {status}
    </span>
  );
}

/* ─── Helper Components ──────────────────────────────────── */

function SummaryCard({ icon, label, value, color, bg, isText }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; bg: string; isText?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${bg} ${color}`}>
        {icon}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 ${isText ? 'text-xl' : 'text-2xl'} font-semibold tracking-tight text-slate-950`}>{value}</p>
    </div>
  );
}

function getPeakHour(activity: HourlyActivity[]): string {
  if (!activity.length) return '--';
  const peak = activity.reduce((max, h) => (h.count > max.count ? h : max), activity[0]);
  return `${peak.hour.toString().padStart(2, '0')}:00`;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return 'Stopped';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
