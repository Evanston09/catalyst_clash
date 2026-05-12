import { Navigate, Route, Routes } from "react-router";

import { MatchRoomProvider } from "@/hooks/useMatchRoom";
import { GamePage } from "@/pages/GamePage";
import { LobbyPage } from "@/pages/LobbyPage";

import "./App.css";

function App() {
  return (
    <MatchRoomProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/lobby" replace />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </MatchRoomProvider>
  );
}

export default App;
