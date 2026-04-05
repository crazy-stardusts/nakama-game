import React, { useState } from "react";
import { findMatch, joinMatch, getSocket } from "../nakama";

export default function Lobby({ session, onMatchJoined, onShowLeaderboard }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [joinId, setJoinId] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);

  const handleFindMatch = async () => {
    setError("");
    setLoading(true);
    setStatus("Finding a match...");
    try {
      const { matchId } = await findMatch();
      setStatus("Joining match...");
      const match = await joinMatch(matchId);
      setupSocketListeners();
      onMatchJoined(match.match_id);
    } catch (err) {
      setError(err.message || "Failed to find match");
      setLoading(false);
      setStatus("");
    }
  };

  const handleJoinMatch = async (e) => {
    e.preventDefault();
    if (!joinId.trim()) return;
    setError("");
    setLoading(true);
    setStatus("Joining match...");
    try {
      const match = await joinMatch(joinId.trim());
      setupSocketListeners();
      onMatchJoined(match.match_id);
    } catch (err) {
      setError(err.message || "Failed to join match");
      setLoading(false);
      setStatus("");
    }
  };

  const setupSocketListeners = () => {
    const socket = getSocket();
    socket.ondisconnect = () => {
      setError("Disconnected from server");
      setLoading(false);
    };
  };

  return (
    <div className="screen lobby-screen">
      <h1 className="game-title">Tic-Tac-Toe</h1>
      <p className="welcome">Welcome, {session.username || "Player"}!</p>

      <div className="lobby-buttons">
        <button onClick={handleFindMatch} disabled={loading}>
          Find Match
        </button>
        <button
          onClick={() => setShowJoinInput(!showJoinInput)}
          disabled={loading}
          className="secondary"
        >
          Join Match
        </button>
        {showJoinInput && (
          <form onSubmit={handleJoinMatch} className="join-form">
            <input
              type="text"
              placeholder="Paste Match ID"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={loading || !joinId.trim()}>
              Join
            </button>
          </form>
        )}
        <button onClick={onShowLeaderboard} disabled={loading} className="secondary">
          Leaderboard
        </button>
      </div>
      {status && <p className="status">{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
