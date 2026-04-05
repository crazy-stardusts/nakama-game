import React, { useState, useEffect } from "react";
import { getLeaderboard, getMyStats, getSession } from "../nakama";

export default function Leaderboard({ onBack }) {
  const [records, setRecords] = useState([]);
  const [myStats, setMyStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const session = getSession();
  const myUserId = session?.user_id;

  useEffect(() => {
    async function load() {
      try {
        const [lb, stats] = await Promise.all([getLeaderboard(), getMyStats()]);
        setRecords(lb.records || []);
        setMyStats(stats);
      } catch (err) {
        setError(err.message || "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="screen leaderboard-screen">
        <h1 className="game-title">Leaderboard</h1>
        <p className="status">Loading...</p>
      </div>
    );
  }

  return (
    <div className="screen leaderboard-screen">
      <h1 className="game-title">Leaderboard</h1>

      {myStats && (
        <div className="my-stats">
          <div className="stat">
            <span className="stat-value">{myStats.wins}</span>
            <span className="stat-label">Wins</span>
          </div>
          <div className="stat">
            <span className="stat-value">{myStats.losses}</span>
            <span className="stat-label">Losses</span>
          </div>
          <div className="stat">
            <span className="stat-value">{myStats.draws || 0}</span>
            <span className="stat-label">Draws</span>
          </div>
          <div className="stat">
            <span className="stat-value">{myStats.streak}</span>
            <span className="stat-label">Streak</span>
          </div>
          <div className="stat">
            <span className="stat-value">{myStats.bestStreak}</span>
            <span className="stat-label">Best</span>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <p className="status">No games played yet. Be the first!</p>
      ) : (
        <div className="lb-table">
          <div className="lb-header">
            <span className="lb-rank">#</span>
            <span className="lb-name">Player</span>
            <span className="lb-wins">Wins</span>
            <span className="lb-streak">Best Streak</span>
          </div>
          {records.map((r, i) => (
            <div
              key={r.userId}
              className={`lb-row ${r.userId === myUserId ? "lb-me" : ""}`}
            >
              <span className="lb-rank">
                {i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : r.rank}
              </span>
              <span className="lb-name">{r.username}</span>
              <span className="lb-wins">{r.wins}</span>
              <span className="lb-streak">{r.bestStreak}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button className="secondary" onClick={onBack}>
        Back to Lobby
      </button>
    </div>
  );
}
