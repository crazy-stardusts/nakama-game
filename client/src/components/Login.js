import React, { useState } from "react";
import { authenticate, connectSocket } from "../nakama";

export default function Login({ onLogin }) {
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await authenticate(nickname.trim());
      await connectSocket();
      onLogin(session);
    } catch (err) {
      setError(err.message || "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="screen login-screen">
      <h1 className="game-title">Tic-Tac-Toe</h1>
      <p className="subtitle">Multiplayer</p>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="text"
          placeholder="Enter your nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          required
          minLength={2}
          maxLength={20}
          autoFocus
        />
        <button type="submit" disabled={loading || nickname.trim().length < 2}>
          {loading ? "Connecting..." : "Play"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
