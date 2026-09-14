import React, { useEffect, useRef } from "react";
import {
  ExternalLink,
  GitPullRequest,
  Terminal,
  FileCode,
  FileText,
  GitMerge,
  ShieldCheck
} from "lucide-react";

export default function LiveTrace({
  events = [],
  latestPr = null,
  activePatchKey = "circuit_breaker.tf",
  onInspectPatch = null,
  onOpenGitOps = null,
  onOpenIncidentReport = null,
  isPrDeployed = false,
}) {
  const scrollRef = useRef(null);

  // Auto-scroll to bottom as events arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getDetailColorClass = (type) => {
    switch (type) {
      case "attack_start":
      case "cascade":
        return "detail-red";
      case "defender_fix":
        return "detail-amber";
      case "simulation_result":
        return "detail-cyan";
      case "pr_opened":
      case "deployment_complete":
        return "detail-green";
      default:
        return "detail-gray";
    }
  };

  const getBadgeClass = (type) => {
    switch (type) {
      case "attack_start":
        return "badge-red";
      case "cascade":
        return "badge-orange";
      case "defender_fix":
        return "badge-amber";
      case "simulation_result":
        return "badge-cyan";
      case "pr_opened":
      case "deployment_complete":
        return "badge-green";
      default:
        return "badge-gray";
    }
  };

  const prLabel = latestPr?.detail
    ? latestPr.detail.split(" ")[0]
    : "#142";
  const prUrl = latestPr?.pr_url || "https://github.com/Indra-Kurkute/NEMESIS-infra/pull/142";

  const hasFixEvent = events.some((e) => e.type === "defender_fix" || e.type === "pr_opened");
  const hasContained = events.some((e) => e.type === "simulation_result" || e.type === "pr_opened");

  return (
    <div className="card-navy live-trace-card">
      <div className="trace-header">
        <div className="trace-header-left">
          <Terminal size={16} className="text-cyan" />
          <h2 className="trace-title">Live trace</h2>
        </div>
        <div className="trace-header-right">
          <span className="trace-counter">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
        </div>
      </div>

      <div className="trace-scroll-area" ref={scrollRef}>
        {events.length === 0 ? (
          <div className="trace-empty">
            <span className="trace-cursor">_</span>
            Awaiting incident stream... Select scenario and click TRIGGER ATTACK.
          </div>
        ) : (
          events.map((ev, index) => (
            <div key={index} className="trace-entry">
              <div className="trace-meta-row">
                <span className="trace-timestamp">[{ev.timestamp}]</span>
                <span className={`trace-type-badge ${getBadgeClass(ev.type)}`}>
                  {ev.type}
                </span>
                {ev.service && (
                  <span className="trace-service">@{ev.service}</span>
                )}
              </div>
              <div className="trace-message">{ev.message}</div>
              {ev.detail && (
                <div
                  className={`trace-detail ${getDetailColorClass(ev.type)}`}
                >
                  ↳ {ev.detail}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Trace Footer Actions: IaC Patch, GitOps Merge Hub, and AI Incident Report */}
      <div className="trace-footer">
        <div className="trace-footer-row">
          {hasFixEvent && onInspectPatch && (
            <button
              className="btn-inspect-action"
              onClick={() => onInspectPatch(activePatchKey)}
              title="Inspect raw Terraform HCL definition"
            >
              <FileCode size={13} />
              <span>Inspect {activePatchKey}</span>
            </button>
          )}

          {hasContained && onOpenIncidentReport && (
            <button
              className="btn-report-action"
              onClick={onOpenIncidentReport}
              title="Generate Executive SRE Post-Mortem and Root Cause Analysis"
            >
              <FileText size={13} />
              <span>AI Post-Mortem (RCA)</span>
            </button>
          )}
        </div>

        {latestPr && (
          <div className="trace-footer-row">
            {onOpenGitOps ? (
              <button
                className={`btn-gitops-action ${isPrDeployed ? "btn-gitops-deployed" : ""}`}
                onClick={onOpenGitOps}
                title="Open GitOps Review & Merge Hub"
              >
                {isPrDeployed ? (
                  <>
                    <ShieldCheck size={14} className="text-green" />
                    <span>Merged & Deployed {prLabel}</span>
                  </>
                ) : (
                  <>
                    <GitMerge size={14} className="text-cyan" />
                    <span>Review & Merge PR {prLabel} (CI Passed)</span>
                  </>
                )}
              </button>
            ) : (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pr-action"
              >
                <GitPullRequest size={15} />
                <span>View pull request {prLabel} &rarr;</span>
                <ExternalLink size={13} className="ml-auto opacity-75" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
