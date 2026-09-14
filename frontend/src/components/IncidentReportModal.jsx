import React, { useState, useEffect } from "react";
import {
  FileText,
  Copy,
  Download,
  Check,
  X,
  AlertTriangle,
  Clock,
  ShieldCheck,
  GitPullRequest
} from "lucide-react";

export default function IncidentReportModal({
  isOpen,
  onClose,
  backendUrl = "http://localhost:8000",
  useMockStream = false,
  scenarioMeta = null,
}) {
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      if (!useMockStream) {
        fetch(`${backendUrl}/incident/report`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.incident_id) {
              setReport({
                incident_id: data.incident_id,
                mttr_seconds: data.mttr_seconds || 3.8,
                pr_reference: data.terraform_file ? `IaC: ${data.terraform_file}` : "PR-142",
                root_cause: data.root_cause_analysis || data.root_cause,
                remediation_summary: data.remediation_applied || data.remediation_summary,
                raw_markdown: data.markdown_content || data.raw_markdown,
              });
            } else {
              setReport(getFallbackReport());
            }
          })
          .catch(() => {
            setReport(getFallbackReport());
          })
          .finally(() => setLoading(false));
      } else {
        setReport(getFallbackReport());
        setLoading(false);
      }
    }
  }, [isOpen, useMockStream, backendUrl]);

  const getFallbackReport = () => {
    const scTitle = scenarioMeta?.title || "Payment Latency Spike";
    const scTarget = scenarioMeta?.target || "Payment Service";
    const scPatch = scenarioMeta?.fixFile || "circuit_breaker.tf";

    return {
      incident_id: "INC-" + Math.floor(100000 + Math.random() * 900000),
      timestamp: new Date().toISOString(),
      scenario: scTitle,
      impacted_services: [scTarget, "Orders Service", "Orders DB"],
      blast_radius_pct: 37.5,
      root_cause: `Downstream dependency stall on ${scTarget} causing synchronous thread pool exhaustion in upstream callers due to missing circuit breaker and timeout enforcement.`,
      remediation_summary: `Synthesized zero-touch IaC patch [${scPatch}]. Applied Envoy outlier detection and circuit breaker policy with max_connections=100 and max_pending_requests=20.`,
      pr_reference: "PR-142",
      mttr_seconds: 4.2,
      raw_markdown: `# NEMESIS Autonomous Incident Post-Mortem

**Incident ID**: INC-849201
**Date**: ${new Date().toUTCString()}
**Severity**: CRITICAL (SEV-1)
**Mean Time to Remediation (MTTR)**: 4.2 seconds
**Autonomous Action**: Zero-touch isolation & GitOps pull request deployment

---

## 1. Executive Summary
At ${new Date().toLocaleTimeString()}, NEMESIS telemetry stream detected anomalous latency degradation on **${scTarget}**. Synchronous upstream threads in **Orders Service** began exhausting connection pools. Autonomous LangGraph agent executed root cause analysis, synthesized an infrastructure-as-code circuit breaker patch, and halted cascading failure at the service boundary.

## 2. Root Cause Analysis (RCA)
- **Primary Failure**: ${scTarget} experienced unhandled synchronous queuing delay exceeding 450ms.
- **Propagation Vector**: Upstream services lacked client-side timeouts and outlier ejection policies.
- **Blast Radius**: 3 of 8 microservices impacted prior to autonomous isolation.

## 3. Autonomous Remediation Actions
1. **Anomaly Detection**: Evaluated streaming P99 latency against rolling circular buffer baseline.
2. **Boundary Isolation**: Isolated inter-service RPC edge between [${scTarget} -> Orders Service].
3. **IaC Generation**: Synthesized declarative Envoy proxy policy in \`terraform/${scPatch}\`.
4. **GitOps Closed Loop**: Created feature branch, committed patch, opened Pull Request, and executed zero-downtime deployment.

## 4. Post-Incident SRE Recommendations
- Adopt adaptive retries with exponential backoff across all inter-service gRPC clients.
- Enforce automated canary blast radius testing on all microservice mesh definitions.
`
    };
  };

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.raw_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([report.raw_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.incident_id || "nemesis-incident"}-post-mortem.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window incident-report-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="incident-header-badge">
              <FileText size={16} className="text-cyan" />
              <span>AI INCIDENT POST-MORTEM & RCA REPORT</span>
            </div>
            <h3 className="modal-title">
              {report ? report.incident_id : "Generating Post-Mortem..."}
            </h3>
            {report && (
              <div className="incident-meta-row">
                <span className="incident-meta-pill">
                  <Clock size={12} /> MTTR: {report.mttr_seconds}s
                </span>
                <span className="incident-meta-pill text-green">
                  <ShieldCheck size={12} /> STATUS: HEALED & CLOSED
                </span>
                <span className="incident-meta-pill">
                  <GitPullRequest size={12} /> {report.pr_reference || "PR-142"}
                </span>
              </div>
            )}
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close Post-Mortem">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading ? (
            <div className="report-loading-state">
              <div className="spinner"></div>
              <span>Synthesizing root cause analysis and impact timeline...</span>
            </div>
          ) : report ? (
            <div className="report-content-wrapper">
              <div className="report-summary-cards">
                <div className="report-card">
                  <span className="report-card-label">Root Cause Analysis</span>
                  <p className="report-card-text">{report.root_cause}</p>
                </div>
                <div className="report-card">
                  <span className="report-card-label">Remediation Patch Applied</span>
                  <p className="report-card-text">{report.remediation_summary}</p>
                </div>
              </div>

              <div className="report-markdown-preview">
                <div className="preview-bar">
                  <span>RAW EXPORTABLE SRE POST-MORTEM (MARKDOWN)</span>
                  <div className="preview-actions">
                    <button className="btn-copy-report" onClick={handleCopy}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copied ? "Copied!" : "Copy Markdown"}</span>
                    </button>
                    <button className="btn-download-report" onClick={handleDownload}>
                      <Download size={13} />
                      <span>Download .md</span>
                    </button>
                  </div>
                </div>
                <pre className="report-code-view">
                  <code>{report.raw_markdown}</code>
                </pre>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="modal-footer-left">
            <span className="text-muted text-xs font-mono">
              Generated by NEMESIS LangGraph Multi-Agent Architecture. Ready for Jira / Confluence / Linear export.
            </span>
          </div>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
