import { useState } from 'react';
import { X, Terminal, Shield, AlertTriangle, Check, XCircle, Loader2, Copy, CheckCheck, FileCode } from 'lucide-react';
import type { AiInsight, RemediationPlan } from '@/types';
import { requestRemediation, executeRemediation } from '@/services/api';

interface RemediationModalProps {
  insight: AiInsight | null;
  onClose: () => void;
}

type ModalState = 'idle' | 'generating' | 'reviewing' | 'executing' | 'success' | 'rejected';

export function RemediationModal({ insight, onClose }: RemediationModalProps) {
  const [state, setState] = useState<ModalState>('idle');
  const [plan, setPlan] = useState<RemediationPlan | null>(null);
  const [copied, setCopied] = useState(false);
  const [resultMessage, setResultMessage] = useState('');

  if (!insight) return null;

  const riskStyles = {
    low: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Check },
    medium: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle },
    high: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/40', icon: AlertTriangle },
  };

  const handleGenerate = async () => {
    setState('generating');
    try {
      const result = await requestRemediation(insight);
      setPlan(result);
      setState('reviewing');
    } catch {
      setState('idle');
    }
  };

  const handleApprove = async () => {
    if (!plan) return;
    setState('executing');
    try {
      const result = await executeRemediation(plan.id, true);
      setResultMessage(result.message);
      setState('success');
    } catch {
      setResultMessage('Execution failed. Please try again.');
      setState('success');
    }
  };

  const handleReject = () => {
    if (plan) {
      executeRemediation(plan.id, false).catch(() => {});
    }
    setState('rejected');
  };

  const handleCopy = () => {
    if (plan) {
      navigator.clipboard.writeText(plan.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setState('idle');
    setPlan(null);
    setResultMessage('');
    onClose();
  };

  const isGenerating = state === 'generating';
  const isExecuting = state === 'executing';
  const showScript = state === 'reviewing' || state === 'executing' || state === 'success';
  const risk = plan ? riskStyles[plan.riskLevel] : riskStyles.low;
  const RiskIcon = risk.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        style={{ animation: 'fadeInUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
              <Terminal className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">AI Remediation Plan</h2>
              <p className="text-xs text-slate-500">{insight.title}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {state === 'idle' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="mb-2 text-sm font-semibold text-white">Issue Summary</h3>
                <p className="text-sm leading-relaxed text-slate-400">{insight.description}</p>
                <div className="mt-3 rounded-lg bg-amber-500/5 border border-amber-500/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/70">Root Cause</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{insight.rootCause}</p>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-slate-500">Recommended:</span>
                  <span className="text-xs text-cyan-400">{insight.recommendedAction}</span>
                </div>
              </div>
              <button
                onClick={handleGenerate}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30"
              >
                <Terminal className="h-4 w-4" />
                Generate Remediation Script
              </button>
            </div>
          )}

          {isGenerating && (
            <div className="flex h-48 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-slate-400">AI engine generating remediation script...</p>
              <p className="text-xs text-slate-600">Analyzing root cause and constructing fix sequence</p>
            </div>
          )}

          {showScript && plan && (
            <div className="space-y-4">
              {/* Plan Info */}
              <div className="grid grid-cols-3 gap-3">
                <div className={`flex items-center gap-2 rounded-xl border ${risk.border} ${risk.bg} px-3 py-2.5`}>
                  <RiskIcon className={`h-4 w-4 ${risk.text}`} />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Risk Level</p>
                    <p className={`text-sm font-semibold ${risk.text} uppercase`}>{plan.riskLevel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                  <FileCode className="h-4 w-4 text-cyan-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Duration</p>
                    <p className="text-sm font-semibold text-white">{plan.estimatedDuration}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Steps</p>
                    <p className="text-sm font-semibold text-white">{plan.steps.length}</p>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                <p className="text-xs leading-relaxed text-slate-400">{plan.description}</p>
              </div>

              {/* Script */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                    </div>
                    <span className="ml-2 text-xs font-medium text-slate-500">remediation_{insight.category}.sh</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                  >
                    {copied ? <CheckCheck className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="max-h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-300" style={{ scrollbarWidth: 'thin' }}>
                  <code>{plan.script}</code>
                </pre>
              </div>

              {/* Success/Rejected States */}
              {state === 'success' && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                  <Check className="h-5 w-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-400">Remediation Executed</p>
                    <p className="text-xs text-slate-400">{resultMessage}</p>
                  </div>
                </div>
              )}

              {state === 'rejected' && (
                <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                  <XCircle className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="text-sm font-semibold text-slate-300">Remediation Rejected</p>
                    <p className="text-xs text-slate-500">No changes were applied to the system.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {state === 'reviewing' && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-5 py-4">
            <button
              onClick={handleReject}
              disabled={isExecuting}
              className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={handleApprove}
              disabled={isExecuting}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/30 disabled:opacity-50"
            >
              {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isExecuting ? 'Executing...' : 'Approve & Execute'}
            </button>
          </div>
        )}

        {(state === 'success' || state === 'rejected') && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-5 py-4">
            <button
              onClick={handleClose}
              className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
