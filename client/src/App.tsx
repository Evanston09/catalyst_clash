import { Navigate, Route, Routes } from "react-router";

import { MatchRoomProvider } from "@/hooks/useMatchRoom";
import { GamePage } from "@/pages/GamePage";
import { LobbyPage } from "@/pages/LobbyPage";
import { TutorialPage } from "@/pages/TutorialPage";
import { VictoryPage } from "@/pages/VictoryPage";
import { WaitingPage } from "@/pages/WaitingPage";

import "./App.css";

function App() {
  return (
    <MatchRoomProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/lobby" replace />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/waiting" element={<WaitingPage />} />
        <Route path="/tutorial" element={<TutorialPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/victory" element={<VictoryPage />} />
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </MatchRoomProvider>
  );
}

export default App;
