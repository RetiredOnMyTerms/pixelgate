import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@radix-ui/themes/styles.css";
import { Theme } from "@radix-ui/themes";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Theme appearance="dark" accentColor="cyan" grayColor="slate" radius="large" scaling="100%">
      <App />
    </Theme>
  </StrictMode>,
);
