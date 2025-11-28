const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const DFU_VID = '0x0451';
const DFU_PID = '0xD00E';

let installationInProgress = false;
let installationPromise = null;
let driverWasInstalled = false;

function getResourcePath(relativePath) {
  let app;
  try {
    app = require('electron').app;
  } catch (e) {
    app = null;
  }

  if (app && app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.join(__dirname, '..', relativePath);
}

function getWinUsbInfPath() {
  const infPath = getResourcePath(path.join('resources', 'binaries', 'omap_winusb', 'omap_winusb.inf'));

  if (!fs.existsSync(infPath)) {
    throw new Error(`omap_winusb.inf not found at ${infPath}`);
  }

  return infPath;
}

async function checkDriverInstalled() {
  if (process.platform !== 'win32') {
    return { installed: true, message: 'Not on Windows' };
  }

  if (driverWasInstalled) {
    return { installed: true, message: 'Driver installed this session and ready in Windows driver store' };
  }

  return new Promise((resolve) => {
    const { exec } = require('child_process');

    const driverStoreCommand = `Get-WindowsDriver -Online | Where-Object {($_.OriginalFileName -like '*Nest DFU Interface*') -or ($_.HardwareId -like '*VID_0451&PID_D00E*')} | Select-Object OriginalFileName, ProviderName, ClassName | ConvertTo-Json`;

    exec(`powershell -Command "${driverStoreCommand}"`, (driverError, driverStdout) => {
      if (!driverError && driverStdout && driverStdout.trim() !== '') {
        try {
          const driverInfo = JSON.parse(driverStdout);
          console.log('Driver found in Windows driver store:', driverInfo);
          resolve({
            installed: true,
            message: 'Driver found in Windows driver store',
            driverInfo
          });
          return;
        } catch (e) {
          console.log('Driver store check - no matching driver found');
        }
      }

      const deviceCommand = `Get-PnpDevice | Where-Object {$_.InstanceId -like '*VID_0451*PID_D00E*'} | Select-Object Status, FriendlyName, InstanceId, Class, Service | ConvertTo-Json`;

      exec(`powershell -Command "${deviceCommand}"`, (error, stdout) => {
        if (error || !stdout || stdout.trim() === '') {
          console.log('DFU device not present and driver not in store');
          resolve({ installed: false, message: 'Driver not installed' });
          return;
        }

        try {
          const devices = JSON.parse(stdout);
          const deviceArray = Array.isArray(devices) ? devices : [devices];

          console.log('Found DFU devices:', deviceArray);

          const hasWinUSBDriver = deviceArray.some(d => {
            const hasWinUSB = d.Service && d.Service.toLowerCase() === 'winusb';
            const isOK = d.Status === 'OK';
            const isUnknown = d.Status === 'Unknown';
            const friendlyName = d.FriendlyName || '';
            const deviceClass = d.Class || '';
            const isUSBDevice = deviceClass === 'USB' || deviceClass === 'USBDevice' || friendlyName.includes('DFU') || friendlyName.includes('USB') || friendlyName.includes('Nest') || friendlyName.includes('OMAP');

            // Accept device if WinUSB service is bound, even if status is Unknown
            // Status 'Unknown' can happen with unsigned drivers but the device still works
            const isReady = hasWinUSB && (isOK || (isUnknown && isUSBDevice));

            console.log(`Device check: Status=${d.Status}, Service=${d.Service}, Class=${deviceClass}, FriendlyName=${friendlyName}, Match=${isReady}`);

            return isReady;
          });

          resolve({
            installed: hasWinUSBDriver,
            devices: deviceArray,
            message: hasWinUSBDriver ? 'WinUSB driver bound to DFU device' : 'DFU device present but driver not bound'
          });
        } catch (e) {
          console.error('Error parsing device info:', e);
          resolve({ installed: false, message: 'Unable to parse device information' });
        }
      });
    });
  });
}

async function installWinUSBDriver() {
  if (process.platform !== 'win32') {
    return { success: true, message: 'Not on Windows, skipping driver installation' };
  }

  if (installationInProgress && installationPromise) {
    console.log('Driver installation already in progress, waiting for existing installation...');
    return installationPromise;
  }

  installationInProgress = true;

  installationPromise = new Promise((resolve, reject) => {
    try {
      const infPath = getWinUsbInfPath();
      const { exec } = require('child_process');

      console.log('Installing WinUSB driver using pnputil...');
      console.log('INF file:', infPath);

      // Use pnputil to add the driver to the Windows driver store
      // /add-driver adds the driver package
      // /install also installs the driver on matching devices
      // /force-if-driver-is-not-better allows installing unsigned/older drivers
      const command = `pnputil /add-driver "${infPath}" /install /force-if-driver-is-not-better`;

      console.log('Command:', command);

      exec(command, (error, stdout, stderr) => {
        const output = stdout + stderr;
        console.log('pnputil output:', output);

        installationInProgress = false;
        installationPromise = null;

        if (error) {
          console.error('pnputil error:', error);
          console.error('stdout:', stdout);
          console.error('stderr:', stderr);

          // Check if driver was already installed (not a fatal error)
          if (output.includes('already') || output.includes('The specified driver package is already installed')) {
            console.log('Driver already in store, marking as installed');
            driverWasInstalled = true;
            resolve({
              success: true,
              message: 'WinUSB driver already installed in Windows driver store',
              output
            });
            return;
          }

          // Check for success keywords despite error code
          if (output.includes('Successfully') || output.includes('Published name')) {
            console.log('Driver installed successfully despite error code');
            driverWasInstalled = true;
            resolve({
              success: true,
              message: 'WinUSB driver installed successfully',
              output
            });
            return;
          }

          reject(new Error(`Failed to install WinUSB driver: ${error.message}\n${output}`));
          return;
        }

        console.log('WinUSB driver successfully installed to driver store');
        driverWasInstalled = true;

        resolve({
          success: true,
          message: 'WinUSB driver installed to Windows driver store',
          output
        });
      });
    } catch (error) {
      installationInProgress = false;
      installationPromise = null;
      reject(error);
    }
  });

  return installationPromise;
}

async function forceDriverUpdate() {
  if (process.platform !== 'win32') {
    return { success: true, message: 'Not on Windows' };
  }

  return new Promise((resolve) => {
    const { exec } = require('child_process');

    console.log('Forcing driver update for DFU device...');

    exec('pnputil /scan-devices', (scanError, scanStdout) => {
      if (scanError) {
        console.warn('Device scan warning:', scanError.message);
      } else {
        console.log('Device scan output:', scanStdout);
      }

      const deviceCommand = `Get-PnpDevice | Where-Object {$_.InstanceId -like '*VID_0451*PID_D00E*'} | Select-Object Status, Service | ConvertTo-Json`;

      exec(`powershell -Command "${deviceCommand}"`, (checkError, checkStdout) => {
        if (!checkError && checkStdout && checkStdout.trim() !== '') {
          try {
            const device = JSON.parse(checkStdout);
            const devices = Array.isArray(device) ? device : [device];
            const hasDriver = devices.some(d => d.Status === 'OK' || (d.Service && d.Service.toLowerCase() === 'winusb'));

            if (hasDriver) {
              console.log('Device now has driver bound!');
              resolve({ success: true, message: 'Driver successfully bound to device' });
              return;
            }
          } catch (e) {
            console.error('Error checking device status:', e);
          }
        }

        console.log('Device still does not have driver bound. May need to use Device Manager to manually update driver.');
        resolve({
          success: false,
          message: 'Driver in store but not automatically bound. Device shows Status: Unknown.'
        });
      });
    });
  });
}

module.exports = {
  installWinUSBDriver,
  checkDriverInstalled,
  forceDriverUpdate,
  DFU_VID,
  DFU_PID
};
