import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Power, Shield, Activity, ArrowDown, ArrowUp } from "lucide-react";
import "./App.css";

function App() {
  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState("Disconnected");
  const [stats, setStats] = useState({ up: "0 B/s", down: "0 B/s" });

  const toggleVpn = async () => {
    try {
      if (!isActive) {
        setStatus("Connecting...");
        // Placeholder config path - in real usage, this would be fetched from API and saved locally
        await invoke("start_vpn", { configPath: "config.yaml" });
        setIsActive(true);
        setStatus("Protected");
      } else {
        setStatus("Disconnecting...");
        await invoke("stop_vpn");
        setIsActive(false);
        setStatus("Disconnected");
      }
    } catch (error) {
      console.error("VPN Action Failed:", error);
      setStatus("Error");
      setTimeout(() => setStatus(isActive ? "Protected" : "Disconnected"), 3000);
    }
  };

  return (
    <div className="container">
      <div className="branding">
        <Shield size={24} color="#ff4500" fill="#ff4500" fillOpacity={0.2} />
        SPICY<span>VPN</span>
      </div>

      <motion.button
        className={`power-button ${isActive ? "active" : ""}`}
        onClick={toggleVpn}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Power size={64} color={isActive ? "#fff" : "#ff4500"} />
      </motion.button>

      <div className="status-text">{status}</div>

      <AnimatePresence>
        {isActive && (
          <motion.div 
            className="stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="stat-item">
              <div className="stat-value"><ArrowUp size={14} /> {stats.up}</div>
              <div className="stat-label">Upload</div>
            </div>
            <div className="stat-item">
              <div className="stat-value"><ArrowDown size={14} /> {stats.down}</div>
              <div className="stat-label">Download</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ position: 'absolute', bottom: '2rem', opacity: 0.3, fontSize: '0.8rem' }}>
        v0.1.0-alpha • Stealth Engine Active
      </div>
    </div>
  );
}

export default App;
