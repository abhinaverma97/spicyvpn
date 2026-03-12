import React, { useState, useEffect } from 'react'
import Dither from './components/Dither'

// Inline SVG Icons (Replacing Lucide)
const IconShield = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
)

const IconShieldCheck = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

function App(): React.JSX.Element {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [sublink, setSublink] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showClosePrompt, setShowClosePrompt] = useState(false)
  const [rememberChoice, setRememberChoice] = useState(false)

  useEffect(() => {
    // Force clear saved choice for testing so the prompt shows up again
    localStorage.removeItem('spicyvpn-close-choice')

    // Load local storage initial state
    const saved = localStorage.getItem('spicyvpn-sublink')
    if (saved) {
      setSublink(saved)
    }

    // @ts-ignore
    window.api?.onStatusChange((status: string) => {
      if (status === 'connected') {
        setIsConnected(true)
        setIsConnecting(false)
      } else if (status === 'disconnected') {
        setIsConnected(false)
        setIsConnecting(false)
      }
    })

    // Listen for close attempts
    // @ts-ignore
    window.api?.onCloseRequested(() => {
      const savedChoice = localStorage.getItem('spicyvpn-close-choice')
      if (savedChoice === 'hide') {
        // @ts-ignore
        window.api?.hideApp()
      } else if (savedChoice === 'quit') {
        // @ts-ignore
        window.api?.quitApp()
      } else {
        setShowClosePrompt(true)
      }
    })
  }, [])

  const handleCloseChoice = (choice: 'hide' | 'quit') => {
    if (rememberChoice) {
      localStorage.setItem('spicyvpn-close-choice', choice)
    }
    setShowClosePrompt(false)
    if (choice === 'hide') {
      // @ts-ignore
      window.api?.hideApp()
    } else {
      // @ts-ignore
      window.api?.quitApp()
    }
  }

  const handleToggleConnection = async () => {
    if (isConnected) {
      setIsConnecting(true)
      // @ts-ignore
      await window.api?.disconnect()
    } else {
      if (!sublink.trim()) {
        setErrorMsg('Please enter a valid token link first.')
        return
      }

      setErrorMsg('')
      setIsConnecting(true)

      // Save link internally first so config.json is generated
      // @ts-ignore
      const saveRes = await window.api?.saveSublink(sublink)
      if (!saveRes?.success) {
        setIsConnecting(false)
        setErrorMsg(saveRes?.error || 'Failed to parse configuration')
        return
      }

      // Persist in local storage
      localStorage.setItem('spicyvpn-sublink', sublink)

      // Automatically Connect
      // @ts-ignore
      const res = await window.api?.connect()
      if (res?.error) {
        setIsConnecting(false)
        setErrorMsg(res.error)
      }
    }
  }

  return (
    <div className="flex flex-col h-screen w-full bg-black text-white overflow-hidden font-sans select-none relative z-0 items-center justify-center p-6">

      {/* Invisible Draggable Title Bar */}
      <div className="absolute top-0 w-full h-[38px] z-50 flex items-center px-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2 pointer-events-none opacity-40">
          <IconShield className="w-4 h-4" />
          <span className="text-xs font-semibold tracking-wider">SPICY VPN</span>
        </div>
      </div>

      {/* Background layer */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none">
        <Dither />
        <div className="absolute inset-0 bg-black/60" />
      </div>

      <main className="relative z-10 flex flex-col items-center justify-center w-full max-w-sm drop-shadow-2xl">

        {/* Minimal Heading */}
        <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-10 text-center text-white/90 drop-shadow-sm">
          Spicy VPN
        </h1>

        {/* Text Box */}
        <div className="w-full mb-8 relative">
          <input
            type="url"
            value={sublink}
            onChange={(e) => setSublink(e.target.value)}
            disabled={isConnected || isConnecting}
            placeholder="Paste sublink token here..."
            className="w-full bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/20 focus:border-white/50 focus:ring-1 focus:ring-white/50 rounded-2xl px-5 py-4 text-center text-sm font-medium text-white placeholder-white/40 outline-none transition-all shadow-inner disabled:opacity-50"
          />
          {errorMsg && (
            <p className="absolute -bottom-7 w-full text-red-400 text-xs text-center font-medium bg-red-950/40 py-1 px-2 rounded-full overflow-hidden text-ellipsis backdrop-blur-sm border border-red-500/20">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Connect Button */}
        <button
          onClick={handleToggleConnection}
          disabled={isConnecting}
          className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide transition-all duration-300 shadow-xl flex items-center justify-center gap-3 backdrop-blur-sm ${
            isConnected
              ? 'bg-white/10 hover:bg-white/20 text-white border border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.1)]'
              : isConnecting
                ? 'bg-black/80 border border-white/20 text-white/50 cursor-not-allowed'
                : 'bg-white text-black hover:bg-white/90 border border-transparent'
          }`}
        >
          {isConnected ? (
            isConnecting ? 'DISCONNECTING...' : 'DISCONNECT'
          ) : isConnecting ? (
            'CONNECTING...'
          ) : (
            'CONNECT'
          )}
        </button>

      </main>

      {/* Close Prompt Modal */}
      {showClosePrompt && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="bg-black/90 border border-white/20 p-8 rounded-3xl w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center">

            <IconShield className="w-12 h-12 text-white/50 mb-4" />

            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Close Application?</h2>
            <p className="text-sm text-white/50 text-center mb-8 leading-relaxed">
              Would you like to hide SpicyVPN to the system tray to stay connected in the background, or completely quit the application?
            </p>

            <div className="flex flex-col gap-3 w-full mb-6">
              <button
                onClick={() => handleCloseChoice('hide')}
                className="w-full bg-white text-black hover:bg-white/90 font-bold py-3.5 rounded-2xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
              >
                Hide to Tray
              </button>
              <button
                onClick={() => handleCloseChoice('quit')}
                className="w-full bg-transparent text-white/80 hover:bg-white/5 hover:text-white border border-white/20 font-semibold py-3.5 rounded-2xl transition-all"
              >
                Quit Application
              </button>
            </div>

            <label className="flex items-center justify-center gap-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${rememberChoice ? 'bg-white border-white' : 'bg-black border-white/30'}`}>
                {rememberChoice && <IconShieldCheck className="w-3.5 h-3.5 text-black" />}
              </div>
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="hidden"
              />
              <span className="text-sm font-medium text-white/60 group-hover:text-white/90 transition-colors tracking-wide">
                Remember my choice
              </span>
            </label>

            <button
              onClick={() => setShowClosePrompt(false)}
              className="mt-6 text-xs font-semibold text-white/30 hover:text-white uppercase tracking-widest transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
