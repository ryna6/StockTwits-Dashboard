import React from "react";

export default function Card(props: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  overview: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <button className="cardHeader" onClick={props.onToggle}>
        <div className="cardHeaderLeft">
          <div className="cardTitle">{props.title}</div>
          {props.subtitle ? <div className="cardSubtitle">{props.subtitle}</div> : null}
        </div>
        <div className="cardHeaderRight">
          {props.right}
          <span className="chev">{props.collapsed ? "▾" : "▴"}</span>
        </div>
      </button>

      <div className="cardBody">
        <div className="cardOverview">{props.overview}</div>
        {!props.collapsed ? <div className="cardExpanded">{props.children}</div> : null}
      </div>
    </div>
  );
}

