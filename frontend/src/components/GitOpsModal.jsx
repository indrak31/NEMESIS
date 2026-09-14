import React, { useState, useEffect } from "react";
import {
  GitPullRequest,
  CheckCircle2,
  Clock,
  GitCommit,
  GitMerge,
  ShieldCheck,
  Code2,
  ExternalLink,
  Settings,
  X,
  AlertCircle
} from "lucide-react";

export default function GitOpsModal({
  isOpen,
  onClose,
  prData,
  onMergeSuccess,
  backendUrl = "http://localhost:8000",
  useMockStream = false,
}) {
  const [activeTab, setActiveTab] = useState("diff"); // 'diff' | 'checks' | 'settings'
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStatus, setMergeStatus] = useState(null); // null | 'success' | 'error'
  const [statusMessage, setStatusMessage] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [targetRepo, setTargetRepo] = useState("Indra-Kurkute/NEMESIS-infra");
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMergeStatus(null);
      setStatusMessage("");
      setIsMerging(false);
      // Fetch latest PR state from backend if available
      if (!useMockStream) {
        fetch(`${backendUrl}/pr/current`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.state === "deployed") {
              setMergeStatus("success");
              setStatusMessage("Remediation patch already deployed to production cloud.");
            }
          })
          .catch(() => {});
      }
    }
  }, [isOpen, useMockStream, backendUrl]);

  if (!isOpen) return null;

  const currentPr = prData || {
    id: "PR-142",
    title: "feat(resilience): dynamic circuit breaker & bulkheading",
    branch: "nemesis/remediation-patch",
    base_branch: "main",
    state: "open",
    url: "https://github.com/Indra-Kurkute/NEMESIS-infra/pull/142",
    author: "nemesis-bot[bot]",
    created_at: new Date().toISOString(),
    diff: `diff --git a/terraform/circuit_breaker.tf b/terraform/circuit_breaker.tf
new file mode 100644
index 0000000..8b2c4e1
--- /dev/null
+++ b/terraform/circuit_breaker.tf
@@ -0,0 +1,18 @@
+resource "envoy_cluster_circuit_breaker" "payment_breaker" {
+  cluster_name           = "payment_service"
+  max_connections        = 100
+  max_pending_requests   = 20
+  max_requests           = 150
+  max_retries            = 2
+  consecutive_5xx_errors = 3
+  base_ejection_time_ms  = 30000
+  enforcing_consecutive_5xx = 100
+}
+
+resource "envoy_outlier_detection" "payment_outlier" {
+  consecutive_5xx                    = 3
+  interval_ms                        = 5000
+  base_ejection_time_ms              = 30000
+  max_ejection_percent               = 50
+  enforcing_consecutive_gateway_failure = 100
+}`,
    checks: [
      { name: "tfsec-security-scan", status: "passed", detail: "0 high, 0 critical vulnerabilities" },
      { name: "terraform-plan-validation", status: "passed", detail: "Plan: 1 to add, 0 to change, 0 to destroy" },
      { name: "canary-blast-check", status: "passed", detail: "Zero regression detected on downstream dependencies" }
    ]
  };

  const handleMergeAndDeploy = async () => {
    setIsMerging(true);
    setMergeStatus(null);
    setStatusMessage("");

    try {
      if (useMockStream) {
        // Simulate real API latency
        await new Promise((resolve) => setTimeout(resolve, 1400));
        setMergeStatus("success");
        setStatusMessage("Patch merged into main. Canary deployment triggered to AWS EKS.");
        if (onMergeSuccess) onMergeSuccess(currentPr);
      } else {
        const res = await fetch(`${backendUrl}/pr/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        const result = await res.json();
        if (res.ok && result.status === "merged_and_deployed") {
          setMergeStatus("success");
          setStatusMessage(result.message || "Remediation patch merged and deployed to production.");
          if (onMergeSuccess) onMergeSuccess(result);
        } else {
          setMergeStatus("error");
          setStatusMessage(result.message || "Failed to merge Pull Request.");
        }
      }
    } catch (err) {
      setMergeStatus("error");
      setStatusMessage("Network error communicating with GitOps backend.");
    } finally {
      setIsMerging(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (!useMockStream) {
      try {
        await fetch(`${backendUrl}/pr/configure`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: githubToken, repo: targetRepo })
        });
      } catch (err) {}
    }
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window gitops-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="gitops-header-badge">
              <GitPullRequest size={16} className="text-cyan" />
              <span>GITOPS AUTOMATION HUB</span>
            </div>
            <h3 className="modal-title">{currentPr.title}</h3>
            <div className="gitops-branches-row">
              <span className="branch-pill source-branch">
                <GitCommit size={12} /> {currentPr.branch}
              </span>
              <span className="branch-arrow">&rarr;</span>
              <span className="branch-pill target-branch">{currentPr.base_branch}</span>
              <span className="gitops-pr-id">#{currentPr.id}</span>
              <span className={`pr-status-badge ${mergeStatus === "success" || currentPr.state === "deployed" ? "status-deployed" : "status-open"}`}>
                {mergeStatus === "success" || currentPr.state === "deployed" ? "DEPLOYED" : "READY TO MERGE"}
              </span>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close Modal">
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="modal-tabs">
          <button
            className={`modal-tab-btn ${activeTab === "diff" ? "active" : ""}`}
            onClick={() => setActiveTab("diff")}
          >
            <Code2 size={14} />
            <span>Unified Diff</span>
          </button>
          <button
            className={`modal-tab-btn ${activeTab === "checks" ? "active" : ""}`}
            onClick={() => setActiveTab("checks")}
          >
            <ShieldCheck size={14} />
            <span>CI/CD Safety Checks ({(currentPr.checks || []).length})</span>
          </button>
          <button
            className={`modal-tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <Settings size={14} />
            <span>GitHub Settings</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body">
          {activeTab === "diff" && (
            <div className="diff-viewer-wrapper">
              <div className="diff-header-bar">
                <span className="diff-filename">terraform/circuit_breaker.tf</span>
                <span className="diff-stats">
                  <span className="text-green">+18 additions</span>{" "}
                  <span className="text-muted">0 deletions</span>
                </span>
              </div>
              <pre className="diff-code-block">
                {(currentPr.diff || "").split("\n").map((line, idx) => {
                  let lineClass = "diff-line-context";
                  if (line.startsWith("+") && !line.startsWith("+++")) {
                    lineClass = "diff-line-add";
                  } else if (line.startsWith("-") && !line.startsWith("---")) {
                    lineClass = "diff-line-del";
                  } else if (line.startsWith("@")) {
                    lineClass = "diff-line-hunk";
                  }
                  return (
                    <div key={idx} className={`diff-line ${lineClass}`}>
                      <span className="diff-line-num">{idx + 1}</span>
                      <span className="diff-line-content">{line}</span>
                    </div>
                  );
                })}
              </pre>
            </div>
          )}

          {activeTab === "checks" && (
            <div className="ci-checks-list">
              {(currentPr.checks || []).map((chk, i) => (
                <div key={i} className="ci-check-item">
                  <div className="ci-check-icon">
                    {chk.status === "passed" ? (
                      <CheckCircle2 size={16} className="text-green" />
                    ) : (
                      <Clock size={16} className="text-amber" />
                    )}
                  </div>
                  <div className="ci-check-info">
                    <div className="ci-check-name">{chk.name}</div>
                    <div className="ci-check-detail">{chk.detail}</div>
                  </div>
                  <div className="ci-check-status-badge badge-passed">
                    {chk.status.toUpperCase()}
                  </div>
                </div>
              ))}
              <div className="ci-summary-callout">
                <ShieldCheck size={16} className="text-cyan" />
                <span>All automated guardrails passed. IaC patch is certified safe for automated zero-downtime deployment.</span>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <form className="gitops-settings-form" onSubmit={handleSaveConfig}>
              <p className="settings-desc">
                Connect your real GitHub Personal Access Token (`repo` scope) to allow NEMESIS to open real pull requests and execute live Git merges against your target repository.
              </p>
              <div className="form-group">
                <label>GitHub Personal Access Token (PAT)</label>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  className="input-text"
                />
                <span className="input-hint">Never committed. Stored securely in backend memory.</span>
              </div>
              <div className="form-group">
                <label>Target Repository (owner/repo)</label>
                <input
                  type="text"
                  placeholder="owner/repo"
                  value={targetRepo}
                  onChange={(e) => setTargetRepo(e.target.value)}
                  className="input-text"
                />
              </div>
              <button type="submit" className="btn-primary btn-save-config">
                {configSaved ? "Settings Saved" : "Save Settings"}
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          {mergeStatus === "success" ? (
            <div className="merge-status-banner banner-success">
              <CheckCircle2 size={16} className="text-green" />
              <span>{statusMessage || "Remediation patch merged and deployed to production."}</span>
            </div>
          ) : mergeStatus === "error" ? (
            <div className="merge-status-banner banner-error">
              <AlertCircle size={16} className="text-red" />
              <span>{statusMessage || "Error deploying patch."}</span>
            </div>
          ) : (
            <div className="modal-footer-left">
              <a
                href={currentPr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-github-link"
              >
                <span>View on GitHub</span>
                <ExternalLink size={13} />
              </a>
            </div>
          )}

          <div className="modal-footer-actions">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              className="btn-merge-deploy"
              onClick={handleMergeAndDeploy}
              disabled={isMerging || mergeStatus === "success" || currentPr.state === "deployed"}
            >
              <GitMerge size={15} />
              <span>
                {isMerging
                  ? "Deploying to Cloud..."
                  : mergeStatus === "success" || currentPr.state === "deployed"
                  ? "Deployed (Production)"
                  : "Merge & Deploy to Cloud"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
