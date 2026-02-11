import React from "react";

type Props = {
  children: React.ReactNode;
  onClose: () => void;
};

type State = {
  hasError: boolean;
};

export default class ModalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Expanded modal render error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="modalFallback" role="alert">
          <div className="modalFallbackTitle">Couldn’t render expanded view.</div>
          <div className="muted">Something in this card failed. You can close this modal safely and continue using the app.</div>
          <button className="refreshBtn" onClick={this.props.onClose} style={{ marginTop: 12 }}>
            Close
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
