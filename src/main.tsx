import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { readSong } from "./lib/song";
import { exportPartsToMidi, importMidiInto, midiNotesFromBytes } from "./lib/midi";
import "./styles.css";

(window as unknown as Record<string, unknown>).__s1 = { readSong, exportPartsToMidi, importMidiInto, midiNotesFromBytes };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
