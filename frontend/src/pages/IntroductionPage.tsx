import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  FileSpreadsheet,
  ClipboardList,
  Eye,
  Monitor,
  Server,
  Database,
  Container,
  Clock,
  Calendar,
  FolderKanban,
  DollarSign,
  BarChart3,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Zap,
  LayoutDashboard,
  PenSquare,
  Grid3x3,
  FileOutput,
  CircleDot,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';

/* Fade-in-up wrapper */
function FadeInSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, isVisible } = useIntersectionObserver();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
    >
      {children}
    </div>
  );
}

/* Animated counter */
function AnimatedNumber({ value, suffix = '', duration = 1500 }: { value: number; suffix?: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const spanRef = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const step = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(eased * value));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value, duration]);

  return <span ref={spanRef}>{display}{suffix}</span>;
}

/* Section header */
function SectionHeader({ label, title, subtitle }: { label: string; title: string; subtitle: string }) {
  return (
    <FadeInSection>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-base font-bold text-blue-600 tracking-widest uppercase">{label}</span>
        <div className="h-px flex-1 max-w-24 bg-blue-600/20" />
      </div>
      <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">{title}</h2>
      <p className="text-xl text-gray-500 max-w-3xl leading-relaxed mb-16">{subtitle}</p>
    </FadeInSection>
  );
}

export function IntroductionPage() {
  const { t } = useTranslation('introduction');
  const { isAuthenticated } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div ref={wrapperRef} className={`h-full flex bg-white ${isFullscreen ? 'fixed inset-0 z-[9999]' : ''}`}>
      <div ref={containerRef} className="flex-1 h-full overflow-y-auto scroll-smooth">

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="fixed top-4 right-4 z-50 p-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen mode'}
      >
        {isFullscreen
          ? <Minimize2 className="w-4 h-4 text-gray-600" />
          : <Maximize2 className="w-4 h-4 text-gray-600" />}
      </button>

      {/* ══════ HERO ══════ */}
      <section
        id="hero"
        className="relative min-h-[100vh] flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e40af 0%, #1e3a8a 35%, #1e1b4b 100%)' }}
      >
        <div className="absolute inset-0">
          <div className="absolute top-20 left-20 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-400/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.02] rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 text-center px-6 max-w-5xl">
          <img src="/branding/edwards-logo.svg" alt="Edwards" className="h-10 md:h-12 mx-auto mb-8 opacity-90 brightness-0 invert" />

          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-white/80 text-base font-medium">{t('hero.badge')}</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-extrabold text-white mb-6 tracking-tight leading-[1.1]">
            {t('hero.title')}
          </h1>
          <p className="text-xl md:text-2xl text-white/60 max-w-2xl mx-auto leading-relaxed mb-12">
            {t('hero.subtitle')}
          </p>

          {!isAuthenticated && (
            <div className="mb-10">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-blue-700 font-semibold text-lg shadow-lg shadow-white/10 hover:bg-blue-50 transition-all duration-200"
              >
                Sign In
                <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
              </Link>
            </div>
          )}

          <div className="inline-flex items-center gap-3 px-4 py-2 mb-16 rounded-full bg-white/5 border border-white/10">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white text-xs font-bold">G</span>
            </div>
            <div className="text-left">
              <p className="text-white/70 text-xs font-medium">{t('hero.author')}</p>
              <p className="text-white/40 text-[10px]">{t('hero.authorRole')}</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-8 md:gap-16">
            {([
              { value: 30, label: t('hero.stats.users'), suffix: '+' },
              { value: 50, label: t('hero.stats.projects'), suffix: '+' },
              { value: 500, label: t('hero.stats.worklogs'), suffix: '+' },
            ]).map(({ value, label, suffix }) => (
              <div key={label} className="text-center">
                <div className="text-5xl md:text-6xl font-extrabold text-white mb-1">
                  <AnimatedNumber value={value} suffix={suffix} />
                </div>
                <div className="text-base text-white/40 font-medium uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => scrollToSection('why')}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/40 hover:text-white/70 transition-colors"
        >
          <span className="text-[11px] tracking-[0.2em] uppercase">{t('hero.scrollCue')}</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </button>
      </section>

      {/* ══════ WHY ══════ */}
      <section id="why" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <SectionHeader label={t('why.sectionLabel')} title={t('why.title')} subtitle={t('why.subtitle')} />

          <div className="grid md:grid-cols-3 gap-8">
            {([
              { key: 'scattered', icon: FileSpreadsheet, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
              { key: 'manual', icon: ClipboardList, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
              { key: 'visibility', icon: Eye, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
            ] as const).map(({ key, icon: Icon, color, bg, border }, i) => (
              <FadeInSection key={key} delay={i * 150}>
                <div className={`group p-8 rounded-2xl border ${border} bg-white hover:shadow-xl transition-all duration-300 h-full relative overflow-hidden`}>
                  <div className={`absolute top-0 right-0 w-32 h-32 ${bg} rounded-full -translate-y-1/2 translate-x-1/2 opacity-50`} />
                  <div className="relative">
                    <div className={`w-14 h-14 ${bg} rounded-2xl flex items-center justify-center mb-6`}>
                      <Icon className={`w-7 h-7 ${color}`} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{t(`why.cards.${key}.title`)}</h3>
                    <p className="text-base text-gray-500 leading-relaxed mb-4">{t(`why.cards.${key}.description`)}</p>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${bg} ${color}`}>
                      <AlertTriangle className="w-3 h-3" />
                      {t(`why.cards.${key}.stat`)}
                    </div>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ WHAT (Architecture) ══════ */}
      <section id="what" className="py-28 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <SectionHeader label={t('what.sectionLabel')} title={t('what.title')} subtitle={t('what.subtitle')} />

          <div className="space-y-3">
            {([
              { layerKey: 'frontend', icon: Monitor, accent: 'border-l-indigo-500', bg: 'bg-indigo-50/50', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600',
                items: ['portal', 'dashboard', 'resourceMatrix'] },
              { layerKey: 'backend', icon: Server, accent: 'border-l-emerald-500', bg: 'bg-emerald-50/50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
                items: ['api', 'classification'] },
              { layerKey: 'data', icon: Database, accent: 'border-l-amber-500', bg: 'bg-amber-50/50', iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
                items: ['schema', 'dimensions', 'sync'] },
              { layerKey: 'infra', icon: Container, accent: 'border-l-gray-400', bg: 'bg-gray-50', iconBg: 'bg-gray-100', iconColor: 'text-gray-500',
                items: ['deploy', 'server'] },
            ]).map(({ layerKey, icon: LayerIcon, accent, bg, iconBg, iconColor, items }, layerIdx) => (
              <FadeInSection key={layerKey} delay={layerIdx * 100}>
                <div className={`rounded-xl border ${accent} border-l-4 ${bg} p-5`}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
                      <LayerIcon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{t(`what.layers.${layerKey}.label`)}</h4>
                  </div>
                  <div className={`grid ${items.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-3`}>
                    {items.map((itemKey) => (
                      <div key={itemKey} className="bg-white rounded-lg p-4 border border-gray-100">
                        <h5 className="text-sm font-bold text-gray-900 mb-1">{t(`what.layers.${layerKey}.items.${itemKey}.title`)}</h5>
                        <p className="text-xs text-gray-500 leading-relaxed">{t(`what.layers.${layerKey}.items.${itemKey}.desc`)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ HOW (Features) ══════ */}
      <section id="how" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <SectionHeader label={t('how.sectionLabel')} title={t('how.title')} subtitle={t('how.subtitle')} />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {([
              { key: 'worklog', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', tag: 'AI Parser' },
              { key: 'resource', icon: Calendar, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', tag: 'FTE Matrix' },
              { key: 'project', icon: FolderKanban, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100', tag: 'PCP Gates' },
              { key: 'financial', icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', tag: 'Cost Buckets' },
              { key: 'reports', icon: BarChart3, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', tag: 'Plan vs Actual' },
              { key: 'ai', icon: Sparkles, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', tag: 'AIBrain GPT-5' },
            ] as const).map(({ key, icon: Icon, color, bg, border, tag }, i) => (
              <FadeInSection key={key} delay={i * 80}>
                <div className={`group relative p-7 rounded-2xl border ${border} bg-white hover:shadow-xl transition-all duration-300 h-full`}>
                  <div className="flex items-start justify-between mb-5">
                    <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 ${color}`} />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bg} ${color} uppercase tracking-wide`}>{tag}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">{t(`how.features.${key}.title`)}</h3>
                  <p className="text-base text-gray-500 leading-relaxed">{t(`how.features.${key}.description`)}</p>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ BENEFITS ══════ */}
      <section id="benefits" className="py-28 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <SectionHeader label={t('benefits.sectionLabel')} title={t('benefits.title')} subtitle={t('benefits.subtitle')} />

          {/* Quantitative */}
          <FadeInSection>
            <h3 className="text-2xl font-bold text-gray-800 mb-8">{t('benefits.quantitative.title')}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
              {([
                { key: 'reporting', icon: Zap, accent: 'text-blue-600', bg: 'bg-blue-50', bar: 'bg-blue-500', pct: 85 },
                { key: 'visibility', icon: Eye, accent: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500', pct: 95 },
                { key: 'tools', icon: TrendingUp, accent: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500', pct: 80 },
                { key: 'accuracy', icon: CheckCircle2, accent: 'text-violet-600', bg: 'bg-violet-50', bar: 'bg-violet-500', pct: 95 },
              ] as const).map(({ key, icon: Icon, accent, bg, bar, pct }, i) => (
                <FadeInSection key={key} delay={i * 100}>
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 h-full">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${accent}`} />
                      </div>
                      <p className="text-base font-medium text-gray-600">{t(`benefits.quantitative.metrics.${key}.label`)}</p>
                    </div>
                    <div className={`text-4xl font-extrabold ${accent} mb-3`}>
                      {t(`benefits.quantitative.metrics.${key}.change`)}
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
                      <div className={`h-full ${bar} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{t(`benefits.quantitative.metrics.${key}.description`)}</p>
                  </div>
                </FadeInSection>
              ))}
            </div>
          </FadeInSection>

          {/* Qualitative */}
          <FadeInSection>
            <h3 className="text-2xl font-bold text-gray-800 mb-8">{t('benefits.qualitative.title')}</h3>
            <div className="grid md:grid-cols-2 gap-5 mb-20">
              {(['singleSource', 'selfService', 'compliance', 'scalable'] as const).map((key, i) => (
                <FadeInSection key={key} delay={i * 100}>
                  <div className="flex gap-4 bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 h-full">
                    <div className="w-8 h-8 bg-blue-600/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-gray-900 mb-2">{t(`benefits.qualitative.items.${key}.title`)}</h4>
                      <p className="text-base text-gray-500 leading-relaxed">{t(`benefits.qualitative.items.${key}.description`)}</p>
                    </div>
                  </div>
                </FadeInSection>
              ))}
            </div>
          </FadeInSection>

          {/* Before/After Table */}
          <FadeInSection>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-6 py-4 font-bold text-gray-700 w-1/3">{t('benefits.comparison.header.category')}</th>
                    <th className="text-left px-6 py-4 font-bold text-gray-400 w-1/3">{t('benefits.comparison.header.before')}</th>
                    <th className="text-left px-6 py-4 font-bold text-blue-600 w-1/3">{t('benefits.comparison.header.after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(['worklogs', 'resource', 'reporting', 'costTracking', 'visibility', 'auth'] as const).map((key, i) => (
                    <tr key={key} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-gray-50 transition-colors`}>
                      <td className="px-6 py-4 font-medium text-gray-700">{t(`benefits.comparison.rows.${key}.category`)}</td>
                      <td className="px-6 py-4 text-gray-400">{t(`benefits.comparison.rows.${key}.before`)}</td>
                      <td className="px-6 py-4 text-gray-900 font-semibold">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          {t(`benefits.comparison.rows.${key}.after`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* ══════ NEXT (Roadmap) ══════ */}
      <section id="next" className="py-28 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <SectionHeader label={t('next.sectionLabel')} title={t('next.title')} subtitle={t('next.subtitle')} />

          <FadeInSection>
            <div className="relative">
              <div className="hidden md:block absolute top-10 left-[5%] right-[5%] h-0.5 bg-gradient-to-r from-blue-600 via-indigo-400 to-gray-200 z-0" />

              <div className="grid md:grid-cols-4 gap-8">
                {(['phase1', 'phase2', 'phase3', 'phase4'] as const).map((key, i) => {
                  const status = t(`next.phases.${key}.status`);
                  const isActive = status === 'active';
                  const isFuture = status === 'future';
                  const isPlanned = status === 'planned';

                  return (
                    <FadeInSection key={key} delay={i * 150}>
                      <div className="relative">
                        <div className="flex items-center mb-8">
                          <div className="relative">
                            <div className={`w-5 h-5 rounded-full border-2 z-10 relative
                              ${isActive ? 'bg-blue-600 border-blue-600' :
                                isPlanned ? 'bg-indigo-600 border-indigo-600' :
                                'bg-white border-gray-300'}`}
                            />
                            {isActive && (
                              <div className="absolute inset-0 rounded-full bg-blue-600 animate-ping opacity-20" />
                            )}
                          </div>
                        </div>

                        <div className={`p-5 rounded-xl ${isActive ? 'bg-blue-600/5 border border-blue-600/20' : isPlanned ? 'bg-indigo-50/50 border border-indigo-100' : 'bg-gray-50 border border-gray-100'}`}>
                          <span className={`text-[10px] font-bold uppercase tracking-widest mb-2 block
                            ${isActive ? 'text-blue-600' : isPlanned ? 'text-indigo-600' : 'text-gray-400'}`}>
                            {t(`next.phases.${key}.label`)}
                          </span>
                          <h4 className={`text-base font-bold mb-2 ${isFuture ? 'text-gray-400' : 'text-gray-900'}`}>
                            {t(`next.phases.${key}.title`)}
                          </h4>
                          <p className={`text-base leading-relaxed ${isFuture ? 'text-gray-300' : 'text-gray-500'}`}>
                            {t(`next.phases.${key}.description`)}
                          </p>
                        </div>
                      </div>
                    </FadeInSection>
                  );
                })}
              </div>
            </div>
          </FadeInSection>

          <FadeInSection className="mt-16">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-2xl p-8 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                <CircleDot className="w-5 h-5 text-blue-600" />
                {t('next.considerations.title')}
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {([0, 1, 2, 3] as const).map((i) => (
                  <div key={i} className="flex items-start gap-3 bg-white rounded-xl p-4 border border-gray-100">
                    <div className="w-6 h-6 bg-blue-600/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <span className="text-base text-gray-600 leading-relaxed">{t(`next.considerations.items.${i}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeInSection>
        </div>
      </section>

      {/* ══════ SCREENSHOTS ══════ */}
      <section id="screens" className="py-28 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <SectionHeader label={t('screens.sectionLabel')} title={t('screens.title')} subtitle={t('screens.subtitle')} />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {([
              { key: 'dashboard', icon: LayoutDashboard, color: 'text-indigo-600', bg: 'from-indigo-50 to-indigo-100/50' },
              { key: 'worklogs', icon: PenSquare, color: 'text-blue-600', bg: 'from-blue-50 to-blue-100/50' },
              { key: 'resourceMatrix', icon: Grid3x3, color: 'text-emerald-600', bg: 'from-emerald-50 to-emerald-100/50' },
              { key: 'projects', icon: FolderKanban, color: 'text-violet-600', bg: 'from-violet-50 to-violet-100/50' },
              { key: 'reports', icon: FileOutput, color: 'text-rose-600', bg: 'from-rose-50 to-rose-100/50' },
            ] as const).map(({ key, icon: Icon, color, bg }, i) => (
              <FadeInSection key={key} delay={i * 100}>
                <div className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300">
                  <div className={`aspect-video bg-gradient-to-br ${bg} flex items-center justify-center relative overflow-hidden`}>
                    <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="text-center relative">
                      <div className="w-16 h-16 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm group-hover:scale-110 transition-transform duration-300">
                        <Icon className={`w-8 h-8 ${color}`} />
                      </div>
                      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{t('screens.placeholder')}</p>
                    </div>
                  </div>
                  <div className="p-6">
                    <h4 className="text-base font-bold text-gray-900 mb-2">{t(`screens.items.${key}.title`)}</h4>
                    <p className="text-base text-gray-500 leading-relaxed">{t(`screens.items.${key}.description`)}</p>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="py-8 bg-gray-50 border-t border-gray-100">
        <p className="text-center text-sm text-gray-400">Edwards Vacuum &middot; Engineering Operation Board &middot; {new Date().getFullYear()}</p>
      </div>
      </div>
    </div>
  );
}

export default IntroductionPage;
