import React, { useState } from "react";
import { X, Copy, Check, FileCode, ShieldCheck, GitCommit } from "lucide-react";
import { TERRAFORM_PATCHES } from "../constants/terraformPatches";

export default function TerraformModal({ patchKey, isOpen, onClose }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const patch = TERRAFORM_PATCHES[patchKey] || TERRAFORM_PATCHES["circuit_breaker.tf"];

  const handleCopy = () => {
    navigator.clipboard.writeText(patch.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <FileCode size={20} className="text-cyan" />
            <div>
              <h3 className="modal-title">{patch.filename}</h3>
              <p className="modal-subtitle">{patch.title}</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Metadata Cards */}
          <div className="modal-meta-grid">
            <div className="meta-card">
              <span className="meta-label">RESILIENCE PATTERN</span>
              <span className="meta-value text-amber">{patch.pattern}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">PROTECTED BOUNDARY</span>
              <span className="meta-value text-cyan">{patch.target}</span>
            </div>
            <div className="meta-card">
              <span className="meta-label">AUTONOMOUS ACTION</span>
              <span className="meta-value text-green">Auto-PR & Simulated Validation</span>
            </div>
          </div>

          <div className="modal-desc-box">
            <strong>Incident Mitigation Rationale:</strong> {patch.description}
          </div>

          {/* Terraform Code Box */}
          <div className="code-box-wrap">
            <div className="code-box-header">
              <span className="code-lang-tag">TERRAFORM (HCL)</span>
              <button className="copy-code-btn" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check size={13} className="text-green" />
                    <span>COPIED!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>COPY CODE</span>
                  </>
                )}
              </button>
            </div>
            <pre className="code-pre">
              <code>{patch.code}</code>
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <div className="modal-proof-badge">
            <ShieldCheck size={15} className="text-green" />
            <span>Formally verified via simulated re-execution</span>
          </div>
          <button className="btn-modal-done" onClick={onClose}>
            Done Inspecting
          </button>
        </div>
      </div>
    </div>
  );
}
