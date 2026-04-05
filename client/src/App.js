import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import Lobby from "./components/Lobby";
import Game from "./components/Game";
import Leaderboard from "./components/Leaderboard";
import { tryAutoLogin, connectSocket } from "./nakama";
import "./App.css";

const SCREENS = {
  LOADING: "loading",
  LOGIN: "login",
  LOBBY: "lobby",
  GAME: "game",
  LEADERBOARD: "leaderboard",
};

function App() {
  const [screen, setScreen] = useState(SCREENS.LOADING);
  const [session, setSession] = useState(null);
  const [matchId, setMatchId] = useState(null);

  useEffect(() => {
    async function autoLogin() {
      const sess = await tryAutoLogin();
      if (sess) {
        await connectSocket();
        setSession(sess);
        setScreen(SCREENS.LOBBY);
      } else {
        setScreen(SCREENS.LOGIN);
      }
    }
    autoLogin();
  }, []);

  const handleLogin = (sess) => {
    setSession(sess);
    setScreen(SCREENS.LOBBY);
  };

  const handleMatchJoined = (id) => {
    setMatchId(id);
    setScreen(SCREENS.GAME);
  };

  const handleLeaveMatch = () => {
    setMatchId(null);
    setScreen(SCREENS.LOBBY);
  };

  if (screen === SCREENS.LOADING) {
    return (
      <div className="app">
        <div className="screen">
          <h1 className="game-title">Tic-Tac-Toe</h1>
          <p className="status">Connecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {screen === SCREENS.LOGIN && <Login onLogin={handleLogin} />}
      {screen === SCREENS.LOBBY && (
        <Lobby
          session={session}
          onMatchJoined={handleMatchJoined}
          onShowLeaderboard={() => setScreen(SCREENS.LEADERBOARD)}
        />
      )}
      {screen === SCREENS.GAME && (
        <Game matchId={matchId} onLeave={handleLeaveMatch} />
      )}
      {screen === SCREENS.LEADERBOARD && (
        <Leaderboard onBack={() => setScreen(SCREENS.LOBBY)} />
      )}
    </div>
  );
}

export default App;
