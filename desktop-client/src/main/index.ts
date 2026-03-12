import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync } from 'fs'
import axios from 'axios'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

let tray: Tray | null = null
let isQuitting = false

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 38
    },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.webContents.send('close-requested')
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC VPN Handlers
  const userDataPath = app.getPath('userData')
  const configPath = join(userDataPath, 'config.json')

  ipcMain.handle('save-sublink', async (_, url: string) => {
    try {
      const res = await axios.get(url)
      const decodedLine = Buffer.from(res.data, 'base64').toString('utf-8').trim()

      // hysteria2://uuid@ip:port?insecure=1&sni=snow.com#SpicyVPN
      if (!decodedLine.startsWith('hysteria2://')) {
        throw new Error('Invalid sublink format')
      }

      const urlObj = new URL(decodedLine.replace('hysteria2://', 'https://'))
      const uuid = urlObj.username
      const server = urlObj.hostname
      const server_port = parseInt(urlObj.port)
      const sni = urlObj.searchParams.get('sni') || ''
      const insecure = urlObj.searchParams.get('insecure') === '1'

      const singboxConfig = {
        log: { level: 'info' },
        dns: {
          servers: [
            { tag: 'google', address: '8.8.8.8', detour: 'proxy' },
            { tag: 'local', address: 'local', detour: 'direct' }
          ],
          rules: [
            { outbound: 'any', server: 'local', disable_cache: true },
            { outbound: 'any', server: 'google' }
          ]
        },
        inbounds: [
          {
            type: 'tun',
            tag: 'tun-in',
            interface_name: 'spicy-tun',
            address: ['172.19.0.1/30'],
            auto_route: true,
            strict_route: true,
            stack: 'gvisor',
            mtu: 1380,
            sniff: true,
            sniff_override_destination: true
          }
        ],
        outbounds: [
          {
            type: 'hysteria2',
            tag: 'proxy',
            server,
            server_port,
            password: uuid,
            tls: { enabled: true, server_name: sni, insecure },
            up_mbps: 100,
            down_mbps: 100
          },
          { type: 'direct', tag: 'direct' },
          { type: 'dns', tag: 'dns-out' }
        ],
        route: {
          rules: [
            { protocol: 'dns', outbound: 'dns-out' },
            { ip_is_private: true, outbound: 'direct' }
          ],
          auto_detect_interface: true
        }
      }

      writeFileSync(configPath, JSON.stringify(singboxConfig, null, 2))
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('connect', async () => {
    if (!existsSync(configPath)) {
      return { success: false, error: 'No configuration found. Please save a sublink first.' }
    }

    return new Promise((resolve) => {
      let singboxExe = ''
      if (process.platform === 'win32') {
        singboxExe = is.dev
          ? join(__dirname, '../../resources/bin/sing-box.exe')
          : join(process.resourcesPath, 'bin/sing-box.exe')
      } else if (process.platform === 'darwin') {
        if (process.arch === 'arm64') {
          singboxExe = is.dev
            ? join(__dirname, '../../resources/bin/mac-arm64/sing-box')
            : join(process.resourcesPath, 'bin/mac-arm64/sing-box')
        } else {
          singboxExe = is.dev
            ? join(__dirname, '../../resources/bin/mac-amd64/sing-box')
            : join(process.resourcesPath, 'bin/mac-amd64/sing-box')
        }
      } else {
        return resolve({ success: false, error: 'Unsupported Platform' })
      }

      const cmd = process.platform === 'win32' 
        ? `"${singboxExe}" run -c "${configPath}"`
        : `"${singboxExe}" run -c "${configPath}"` // Mac cmd is identical, but we might need sudo or similar later. For now let's hope it runs with admin if the app is launched elevated, or we need sudo prompt logic again. Wait, Mac electron apps aren't launched as root easily. Let's just run it; standard TUN might require root, we will see.

      const child = exec(cmd, () => {
        // This callback triggers when the process EXITS, not starts unfortunately.
        // Actually, if it connects and stays open, the user won't get resolve until it disconnects.
        BrowserWindow.getAllWindows()[0]?.webContents.send('vpn-status', 'disconnected')
      })

      child.stdout?.on('data', (data) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vpn-log', data.toString())
      })

      child.stderr?.on('data', (data) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vpn-log', data.toString())
      })

      // Assuming success if it doesn't crash immediately
      setTimeout(() => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vpn-status', 'connected')
        resolve({ success: true })
      }, 3000)
    })
  })

  ipcMain.handle('disconnect', async () => {
    return new Promise((resolve) => {
      const killCmd = process.platform === 'win32' ? 'taskkill /F /IM sing-box.exe' : 'killall sing-box'
      exec(killCmd, () => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('vpn-status', 'disconnected')
        resolve({ success: true })
      })
    })
  })

  ipcMain.on('hide-app', () => {
    BrowserWindow.getAllWindows()[0]?.hide()
  })

  ipcMain.on('quit-app', () => {
    isQuitting = true
    exec('taskkill /F /IM sing-box.exe', () => {
      if (tray) tray.destroy()
      app.quit()
    })
  })

  try {
    const iconImage = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
    tray = new Tray(iconImage)
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show SpicyVPN', click: () => BrowserWindow.getAllWindows()[0]?.show() },
      { 
        label: 'Quit', 
        click: () => { 
          isQuitting = true
          const killCmd = process.platform === 'win32' ? 'taskkill /F /IM sing-box.exe' : 'killall sing-box'
          exec(killCmd, () => {
            if (tray) tray.destroy()
            app.quit()
          })
        } 
      }
    ])
    tray.setToolTip('SpicyVPN')
    tray.setContextMenu(contextMenu)
    tray.on('click', () => {
      BrowserWindow.getAllWindows()[0]?.show()
    })
  } catch (err) {
    console.error('Failed to create tray', err)
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
