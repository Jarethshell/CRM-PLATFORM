const { app, BrowserWindow } = require('electron');
const { startServer } = require('./server');

let mainWindow;
let serverInstance;

function createWindow() {
  const userDataPath = app.getPath('userData');
  serverInstance = startServer(3456, userDataPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: 'CCS ProCRM - Grade 12 Capstone Platform',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('http://localhost:3456');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverInstance) serverInstance.close();
  if (process.platform !== 'darwin') app.quit();
});