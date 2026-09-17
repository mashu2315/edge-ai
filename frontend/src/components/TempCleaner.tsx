import { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  FileCode,
  FolderSync,
  CheckCircle2,
  Terminal,
  Loader2,
  Copy,
  Check,
  X,
  HardDrive,
  Info,
  Clock,
  Filter,
} from 'lucide-react';
import { analyzeTempFiles, getCleanupPlan, executeCleanup } from '@/services/api';
import { wsService } from '@/services/websocket';
import type { CleanupAnalysisResult, TempFileItem, CleanupExecutionResult } from '@/types';

type FilterTab = 'safe' | 'skipped' | 'all';

export function TempCleaner() {
  const [analysis, setAnalysis] = useState<CleanupAnalysisResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<FilterTab>('safe');

  // Modal & execution state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<CleanupExecutionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initial scan or auto-load
  useEffect(() => {
    handleScan();

    // Listen for WebSocket live suggestions
    const unsub = wsService.subscribe((payload) => {
      if (payload.type === 'cleanup:suggestions') {
        setAnalysis(payload.data);
        if (payload.data.safe_to_delete) {
          setSelectedPaths(new Set(payload.data.safe_to_delete.map((f) => f.path)));
        }
      }
    });

    return () => unsub();
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    setExecutionResult(null);
    try {
      const result = await analyzeTempFiles();
      setAnalysis(result);
      if (result.safe_to_delete && result.safe_to_delete.length > 0) {
        // Pre-select all safe-to-delete files by default
        setSelectedPaths(new Set(result.safe_to_delete.map((f) => f.path)));
        setActiveTab('safe');
      } else {
        // If 0 safe to delete, show all scanned files so the user sees all detected files
        setSelectedPaths(new Set());
        setActiveTab('all');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to scan temp files');
    } finally {
      setIsScanning(false);
    }
  };

  const allFiles = useMemo(() => {
    if (!analysis) return [];
    return [...(analysis.safe_to_delete || []), ...(analysis.skip || [])];
  }, [analysis]);

  const displayedFiles = useMemo(() => {
    if (!analysis) return [];
    if (activeTab === 'safe') return analysis.safe_to_delete || [];
    if (activeTab === 'skipped') return analysis.skip || [];
    return allFiles;
  }, [analysis, activeTab, allFiles]);

  const toggleSelect = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAllSafe = () => {
    if (!analysis?.safe_to_delete) return;
    const safePaths = analysis.safe_to_delete.map((f) => f.path);
    const allSelected = safePaths.every((p) => selectedPaths.has(p));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(safePaths));
    }
  };

  const selectedSizeMb = useMemo(() => {
    if (!analysis) return 0;
    const totalKb = allFiles
      .filter((f) => selectedPaths.has(f.path))
      .reduce((sum, f) => sum + f.size_kb, 0);
    return (totalKb / 1024).toFixed(2);
  }, [analysis, allFiles, selectedPaths]);

  const handleOpenPreview = async () => {
    if (selectedPaths.size === 0) return;
    setIsGeneratingScript(true);
    setErrorMsg(null);
    setPreviewOpen(true);
    try {
      const plan = await getCleanupPlan(Array.from(selectedPaths));
      setCurrentPlanId(plan.id);
      setGeneratedScript(plan.script);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const handleApproveAndExecute = async () => {
    if (selectedPaths.size === 0) return;
    setIsExecuting(true);
    try {
      const pathsToDelete = Array.from(selectedPaths);
      const res = await executeCleanup(pathsToDelete, true, currentPlanId || undefined);
      setExecutionResult(res);
      setPreviewOpen(false);

      if (res.success) {
        // Immediately remove deleted files from state and clear selection to empty the list
        const deletedSet = new Set(pathsToDelete);
        setAnalysis((prev) => {
          if (!prev) return null;
          const updatedSafe = (prev.safe_to_delete || []).filter((f) => !deletedSet.has(f.path));
          const updatedSkip = (prev.skip || []).filter((f) => !deletedSet.has(f.path));
          const newReclaimable = updatedSafe.reduce((acc, f) => acc + (f.size_kb / 1024), 0);
          return {
            ...prev,
            safe_to_delete: updatedSafe,
            skip: updatedSkip,
            scanned: updatedSafe.length + updatedSkip.length,
            total_reclaimable_mb: parseFloat(newReclaimable.toFixed(2)),
          };
        });
        setSelectedPaths(new Set());
      }

      // Re-scan after execution to refresh and ensure filesystem sync
      setTimeout(() => handleScan(), 1500);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (kb: number) => {
    if (kb >= 1024) {
      return `${(kb / 1024).toFixed(2)} MB`;
    }
    return `${kb.toFixed(1)} KB`;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800/60 bg-gradient-to-r from-cyan-500/10 via-slate-900/60 to-purple-500/10 p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/30 shadow-lg shadow-cyan-500/20">
            <Trash2 className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white">AI-Powered Intelligent Temp Cleaner</h2>
              <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                Local AI Model
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Scans <code className="text-slate-300">/tmp</code>, <code className="text-slate-300">/var/tmp</code>, <code className="text-slate-300">~/.cache</code>, and <code className="text-slate-300">~/.local/share/Trash</code>. Classifies files with safe offline heuristics.
            </p>
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={isScanning}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40 disabled:opacity-50"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Scanning...</span>
            </>
          ) : (
            <>
              <FolderSync className="h-4 w-4" />
              <span>Scan & Classify</span>
            </>
          )}
        </button>
      </div>

      {/* Target Directory Pills */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 font-medium">Target Scan Directories:</span>
        {['/tmp', '/var/tmp', '~/.cache', '~/.local/share/Trash'].map((dir) => (
          <span
            key={dir}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-slate-400 font-mono text-[11px]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
            {dir}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          Never touches active sockets, locks, or files &lt; 24h old
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Total Scanned</span>
            <HardDrive className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{analysis?.scanned ?? 0}</p>
          <p className="text-xs text-slate-500">Files analyzed across directories</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">Safe To Delete</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{analysis?.safe_to_delete?.length ?? 0}</p>
          <p className="text-xs text-emerald-400/80">
            {analysis?.total_reclaimable_mb ? `${analysis.total_reclaimable_mb} MB reclaimable` : '0 MB reclaimable'}
          </p>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Protected / Skipped</span>
            <ShieldAlert className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{analysis?.skip?.length ?? 0}</p>
          <p className="text-xs text-amber-400/80">Sockets, locks, PIDs, recent files</p>
        </div>

        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-purple-400 font-semibold">Selected for Cleanup</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-white">{selectedPaths.size}</p>
          <p className="text-xs text-purple-400/80">{selectedSizeMb} MB ready to free</p>
        </div>
      </div>

      {/* Execution Success Notification */}
      {executionResult && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-emerald-400">Cleanup Executed Successfully</h4>
              <p className="text-xs text-slate-300 mt-0.5">{executionResult.message}</p>
              {executionResult.manifest_path && (
                <p className="text-[11px] text-slate-400 mt-1 font-mono">
                  Backup Manifest: {executionResult.manifest_path}
                </p>
              )}
            </div>
            <button
              onClick={() => setExecutionResult(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {executionResult.output && (
            <pre className="mt-3 max-h-36 overflow-y-auto rounded-xl bg-slate-950/80 p-3 font-mono text-[11px] text-slate-300">
              {executionResult.output}
            </pre>
          )}
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Table Area */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
        {/* Table Toolbar */}
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            <div className="flex rounded-lg border border-slate-800 bg-slate-950/60 p-0.5">
              <button
                onClick={() => setActiveTab('safe')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === 'safe'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Safe to Delete ({analysis?.safe_to_delete?.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('skipped')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === 'skipped'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Protected / Skipped ({analysis?.skip?.length ?? 0})
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                  activeTab === 'all'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Files ({allFiles.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {analysis?.safe_to_delete && analysis.safe_to_delete.length > 0 && (
              <button
                onClick={toggleSelectAllSafe}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Toggle Select All Safe
              </button>
            )}
            <button
              onClick={handleOpenPreview}
              disabled={selectedPaths.size === 0 || isExecuting}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all disabled:opacity-40"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>Review & Clean ({selectedPaths.size})</span>
            </button>
          </div>
        </div>

        {/* File Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800/80 bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4 w-10">
                  <span className="sr-only">Select</span>
                </th>
                <th className="py-3 px-4">File Path</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Age</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4">Confidence</th>
                <th className="py-3 px-4">AI Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {displayedFiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {isScanning ? (
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                        <span>Running AI scanner & feature extractor...</span>
                      </div>
                    ) : (
                      'No temporary files found in this category.'
                    )}
                  </td>
                </tr>
              ) : (
                displayedFiles.map((file) => {
                  const isSelected = selectedPaths.has(file.path);
                  return (
                    <tr
                      key={file.path}
                      className={`transition-colors hover:bg-slate-800/30 ${
                        isSelected ? 'bg-cyan-500/5' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(file.path)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                        />
                      </td>
                      <td className="py-2.5 px-4 font-mono text-[11px] text-slate-200 break-all max-w-xs sm:max-w-md">
                        {file.path}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-300 whitespace-nowrap">
                        {formatSize(file.size_kb)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-500" />
                          {file.age_hours >= 24
                            ? `${(file.age_hours / 24).toFixed(1)}d ago`
                            : `${file.age_hours.toFixed(1)}h ago`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {file.label === 'junk' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Junk / Safe
                          </span>
                        ) : file.label === 'system-critical' ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-400">
                            <ShieldAlert className="h-3 w-3" />
                            Critical
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                            <Info className="h-3 w-3" />
                            User Active
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.round(file.confidence * 100)}%`,
                                backgroundColor:
                                  file.confidence >= 0.85
                                    ? '#34d399'
                                    : file.confidence >= 0.7
                                    ? '#fbbf24'
                                    : '#fb7185',
                              }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400">
                            {(file.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-400 max-w-xs truncate" title={file.reason}>
                        {file.reason}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Approval & Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl animate-fadeInUp">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                  <Terminal className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Review & Confirm Cleanup Plan</h3>
                  <p className="text-xs text-slate-400">
                    {selectedPaths.size} files selected · ~{selectedSizeMb} MB will be freed
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Safety Guarantee Alert */}
              <div className="flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 text-xs text-slate-300">
                <ShieldCheck className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="font-semibold text-cyan-300">Safety & Sandboxing Enforced</h5>
                  <p className="mt-1 text-slate-400 leading-relaxed">
                    A deletion manifest with file paths and sizes will be backed up to <code className="text-slate-200">/var/log/edge-ai/cleanup/</code> before deletion. Execution runs via sandboxed bash runner without shell injection surface.
                  </p>
                </div>
              </div>

              {/* Script Viewer */}
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <FileCode className="h-4 w-4 text-cyan-400" />
                    <span className="font-mono text-xs font-semibold text-slate-400">
                      cleanup_execution.sh
                    </span>
                  </div>
                  <button
                    onClick={handleCopyScript}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Script'}</span>
                  </button>
                </div>

                {isGeneratingScript ? (
                  <div className="flex h-48 items-center justify-center gap-2 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                    <span>Constructing safe bash script...</span>
                  </div>
                ) : (
                  <pre
                    className="max-h-72 overflow-y-auto p-4 font-mono text-xs leading-relaxed text-slate-300"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    <code>{generatedScript}</code>
                  </pre>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4">
              <p className="text-xs text-slate-500">Explicit approval required</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApproveAndExecute}
                  disabled={isExecuting || isGeneratingScript}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all disabled:opacity-50"
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Executing Deletion...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Approve & Clean {selectedPaths.size} Files</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

