import React, { useEffect } from "react";
import ModalErrorBoundary from "./ModalErrorBoundary";

export default function Card(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  overview: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}) {
  const isOpen = !props.collapsed;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, props]);

  return (
    <>
      <section className="card">
        <div className="cardHead" onClick={props.onToggle} role="button" tabIndex={0}>
          <div className="cardHeadLeft">
            <div className="cardTitleRow">
              <div className="cardTitle">{props.title}</div>
              {props.right ? <div className="cardRight">{props.right}</div> : null}
            </div>
            {props.subtitle ? <div className="cardSubtitle">{props.subtitle}</div> : null}
          </div>

          <button className="cardOpenBtn" onClick={(e) => { e.stopPropagation(); props.onToggle(); }}>
            Open
          </button>
        </div>

        <div className="cardOverview">{props.overview}</div>
      </section>

      {isOpen ? (
        <div className="modalBackdrop" onMouseDown={props.onToggle}>
          <div className="modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <div className="modalHeaderLeft">
                <div className="modalTitleRow">
                  <div className="modalTitle">{props.title}</div>
                  {props.right ? <div className="modalRight">{props.right}</div> : null}
                </div>
                {props.subtitle ? <div className="modalSubtitle">{props.subtitle}</div> : null}
              </div>

              <button className="modalCloseBtn" onClick={props.onToggle} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalBody">
              <ModalErrorBoundary onClose={props.onToggle}>{props.children}</ModalErrorBoundary>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
