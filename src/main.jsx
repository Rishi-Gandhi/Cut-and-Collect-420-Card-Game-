import React from "react";
import ReactDOM from "react-dom/client";
import TenSuitCutGame from "../cut-and-collect-project/TenSuitCutGame.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <div style={{ display: "flex", justifyContent: "center", padding: 10 }}>
      <TenSuitCutGame />
    </div>
  </React.StrictMode>
);
