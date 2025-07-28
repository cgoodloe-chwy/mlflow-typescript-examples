const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const prompts = require('prompts');

// ANSI colors for console output
const colors = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const envVars = {};
      
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
      
      return envVars;
    } catch (error) {
      return {};
    }
  }
  return {};
}

function writeEnvFile(filePath, envVars) {
  const content = Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n';
  
  fs.writeFileSync(filePath, content, 'utf-8');
}

async function setupEnvironment(appName, envPath, requiredVars) {
  log(`\n🔧 Final step! Setting up LLM/tools for ${appName}...`, 'blue');

  const existingEnv = checkEnvFile(envPath);
  const responses = {};

  for (const varConfig of requiredVars) {
    const { key, message, type = 'text', validate } = varConfig;
    const existing = existingEnv[key];

    if (existing && existing.length > 0) {
      log(`✅ ${key} already configured`, 'green');
      responses[key] = existing;
      continue;
    }

    const response = await prompts({
      type,
      name: 'value',
      message,
      validate: validate || (val => val.length > 0 ? true : 'This field is required')
    });

    if (!response.value) {
      log('❌ Setup cancelled', 'red');
      process.exit(1);
    }

    responses[key] = response.value;
  }

  // Merge with existing env vars to preserve other settings
  const finalEnv = { ...existingEnv, ...responses };
  writeEnvFile(envPath, finalEnv);
  return responses;
}

// MLflow helper functions
async function checkDatabricksConfig() {
  const databricksCfgPath = path.join(os.homedir(), '.databrickscfg');
  return fs.existsSync(databricksCfgPath);
}

async function checkMLflowServer(trackingUri) {
  try {
    const url = new URL('/health', trackingUri);
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function getExperimentByName(trackingUri, experimentName, headers = {}) {
  try {
    const url = new URL('/api/2.0/mlflow/experiments/get-by-name', trackingUri);
    url.searchParams.append('experiment_name', experimentName);
    
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.experiment;
    } else if (response.status === 404) {
      return null; // Experiment doesn't exist
    } else {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

async function createExperiment(trackingUri, experimentName, headers = {}) {
  try {
    const url = new URL('/api/2.0/mlflow/experiments/create', trackingUri);
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({
        name: experimentName
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.experiment_id;
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create experiment: ${response.status} ${errorData.message || response.statusText}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

async function resolveExperimentId(trackingUri, input, headers = {}) {
  // If input is a number, return it as-is
  if (/^\d+$/.test(input.trim())) {
    return input.trim();
  }
  
  // Input is a name, try to get experiment by name
  const experimentName = input.trim();
  log(`🔍 Looking for experiment "${experimentName}"...`, 'blue');
  
  try {
    const experiment = await getExperimentByName(trackingUri, experimentName, headers);
    
    if (experiment) {
      log(`✅ Found existing experiment "${experimentName}" (ID: ${experiment.experiment_id})`, 'green');
      return experiment.experiment_id;
    } else {
      log(`⚠️  Experiment "${experimentName}" not found`, 'yellow');
      
      const createChoice = await prompts({
        type: 'select',
        name: 'value',
        message: '🤔 Would you like to create this experiment?',
        choices: [
          { title: `✨ Create new experiment "${experimentName}"`, value: 'create' },
          { title: '🔙 Use default experiment (ID: 0)', value: 'default' },
          { title: '✏️  Enter a different experiment name/ID', value: 'retry' }
        ]
      });
      
      if (!createChoice.value) {
        throw new Error('Setup cancelled');
      }
      
      if (createChoice.value === 'create') {
        log(`Creating experiment "${experimentName}"...`, 'blue');
        const experimentId = await createExperiment(trackingUri, experimentName, headers);
        log(`Created experiment "${experimentName}" with ID: ${experimentId}`, 'green');
        return experimentId;
      } else if (createChoice.value === 'default') {
        log('Using default experiment (ID: 0)', 'blue');
        return '0';
      } else {
        // User wants to retry with different input
        return 'retry';
      }
    }
  } catch (error) {
    log(`❌ Error accessing MLflow API: ${error.message}`, 'red');
    log('⚠️  Falling back to default experiment (ID: 0)', 'yellow');
    return '0';
  }
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      stdio: 'pipe',
      ...options
    });

    let stdout = '';
    let stderr = '';

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
}

async function checkCommandExists(command) {
  try {
    await runCommand('which', [command]);
    return true;
  } catch {
    return false;
  }
}

async function installMLflowLocally(rootDir) {
  log('\n🔧 Setting up local MLflow environment...', 'blue');

  const venvPath = path.join(rootDir, '.venv');

  try {
    // Check if pip is installed
    const hasPip = await checkCommandExists('pip') || await checkCommandExists('pip3');
    if (!hasPip) {
      log('❌ pip is not installed. Please install Python and pip first.', 'red');
      return false;
    }

    // Check if uv is installed, if not install it
    const hasUv = await checkCommandExists('uv');
    if (!hasUv) {
      log('📦 Installing uv (fast Python package manager)...', 'yellow');
      await runCommand('pip', ['install', 'uv']);
      log('✅ uv installed successfully', 'green');
    }

    // Create virtual environment with uv
    log('Creating Python virtual environment...', 'yellow');
    await runCommand('uv', ['venv', venvPath]);
    log('Virtual environment created', 'green');

    // Install MLflow
    log('Installing MLflow...', 'yellow');
    await runCommand('uv', ['pip', 'install', 'mlflow', '--pre', '--upgrade']);
    log('MLflow installed successfully', 'green');

    // Start MLflow UI in background
    log('Starting MLflow UI server...', 'yellow');
    const mlflowProcess = spawn('uv', [
      'run',
      'mlflow',
      'ui',
      '--port', '5000',
      '--backend-store-uri', 'sqlite:///mlflow.db',
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: rootDir
    });

    // Save PID for later cleanup
    const pidFile = path.join(rootDir, '.mlflow-server.pid');
    fs.writeFileSync(pidFile, mlflowProcess.pid.toString());

    mlflowProcess.unref();

    // Wait for server to start up (poll every 1 second for up to 20 seconds)
    log('Waiting for MLflow server to start up... (this may take a few seconds)', 'yellow');
    const maxWaitTime = 20000; // 20 seconds
    const pollInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const isRunning = await checkMLflowServer('http://localhost:5000');
      if (isRunning) {
        log('\n✅ MLflow UI server started successfully at http://localhost:5000', 'green');
        return true;
      }

      // Show progress dots
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    log('\n⚠️ MLflow server startup timed out after 20 seconds', 'yellow');
    log('   The server may still be starting. Check http://localhost:5000 in a moment.', 'blue');
    return true; // Don't fail the setup, just warn

  } catch (error) {
    log(`❌ Failed to setup MLflow: ${error.message}`, 'red');
    return false;
  }
}

// Unified MLflow setup flow
async function setupMLflowConfiguration(existingEnv, rootDir) {
  const responses = {};
  
  // Ask about MLflow deployment type if not already configured
  if (!existingEnv.MLFLOW_TRACKING_URI) {
    const mlflowType = await prompts({
      type: 'select',
      name: 'value',
      message: '🎯 Which MLflow deployment would you like to use?',
      choices: [
        { title: '📦 Self-hosted MLflow (local or custom server)', value: 'self-hosted' },
        { title: '🌩️  Cloud-based MLflow on Databricks', value: 'databricks' }
      ]
    });

    if (!mlflowType.value) {
      log('❌ Setup cancelled', 'red');
      process.exit(1);
    }

    if (mlflowType.value === 'self-hosted') {
      // Self-hosted MLflow configuration
      let trackingUri = 'http://localhost:5000'; // Default

      // Ask for tracking URI first
      const uriResponse = await prompts({
        type: 'text',
        name: 'value',
        message: '🎯 Enter MLflow tracking URI (e.g., http://localhost:5000):',
        initial: 'http://localhost:5000',
        validate: val => {
          if (!val) return 'MLflow tracking URI is required';
          if (!val.startsWith('http://') && !val.startsWith('https://')) {
            return 'Please enter a valid URL starting with http:// or https://';
          }
          return true;
        }
      });

      if (!uriResponse.value) {
        log('❌ Setup cancelled', 'red');
        process.exit(1);
      }

      trackingUri = uriResponse.value;
      responses.MLFLOW_TRACKING_URI = trackingUri;

      // Check if the MLflow server is running
      log('\n🔍 Checking MLflow server...', 'blue');
      const isServerRunning = await checkMLflowServer(trackingUri);

      if (!isServerRunning && trackingUri.includes('localhost:5000')) {
        log('❌ MLflow server is not running on localhost:5000', 'red');

        const installChoice = await prompts({
          type: 'select',
          name: 'value',
          message: '🤔 How would you like to proceed?',
          choices: [
            { title: '📦 Install MLflow and start the local server automatically', value: 'install' },
            { title: '⚠️  Continue without starting the server (I\'ll start it manually)', value: 'skip' }
          ]
        });

        if (!installChoice.value) {
          log('❌ Setup cancelled', 'red');
          process.exit(1);
        }

        if (installChoice.value === 'skip') {
          log('⚠️  Please make sure your MLflow server is running before starting the app.', 'yellow');
          log('   You can start it later with: npm run mlflow:start', 'blue');
        } else {
          const installSuccess = await installMLflowLocally(rootDir);
          if (!installSuccess) {
            log('❌ Failed to setup MLflow server. Please install manually.', 'red');
            process.exit(1);
          }
        }
      } else if (!isServerRunning) {
        log(`⚠️  Could not connect to MLflow server at ${trackingUri}`, 'yellow');
        log('   Please make sure the server is running before starting the app.', 'yellow');
      } else {
        log('✅ MLflow server is running and accessible', 'green');
      }
    } else {
      // Databricks configuration
      responses.MLFLOW_TRACKING_URI = 'databricks';

      // Check if ~/.databrickscfg exists
      const hasDatabricksCfg = await checkDatabricksConfig();

      if (!hasDatabricksCfg) {
        log('\n⚠️  No Databricks config file found. You\'ll need to provide Databricks credentials.', 'yellow');

        const databricksHostResponse = await prompts({
          type: 'text',
          name: 'value',
          message: '🏢 Enter Databricks host (e.g., https://your-workspace.databricks.com):',
          validate: val => {
            if (!val) return 'Databricks host is required';
            if (!val.startsWith('http://') && !val.startsWith('https://')) {
              return 'Please enter a valid URL starting with http:// or https://';
            }
            return true;
          }
        });

        if (!databricksHostResponse.value) {
          log('❌ Setup cancelled', 'red');
          process.exit(1);
        }

        const databricksTokenResponse = await prompts({
          type: 'password',
          name: 'value',
          message: '🔑 Enter Databricks access token:',
          validate: val => val.length > 0 ? true : 'Databricks token is required'
        });

        if (!databricksTokenResponse.value) {
          log('❌ Setup cancelled', 'red');
          process.exit(1);
        }

        responses.DATABRICKS_HOST = databricksHostResponse.value;
        responses.DATABRICKS_TOKEN = databricksTokenResponse.value;
      } else {
        log('\n✅ Found ~/.databrickscfg file. Will use it for authentication.', 'green');
      }
    }
  }

  // Handle experiment ID/name configuration with MLflow API
  if (!existingEnv.MLFLOW_EXPERIMENT_ID) {
    let experimentId = '0';

    while (true) {
      const experimentInput = await prompts({
        type: 'text',
        name: 'value',
        message: '🧪 Enter MLflow experiment name or ID (default: 0):',
        initial: '0',
        validate: val => val.length > 0 ? true : 'Experiment name or ID is required'
      });

      if (!experimentInput.value) {
        log('❌ Setup cancelled', 'red');
        process.exit(1);
      }

      // Get appropriate headers for API calls
      const apiHeaders = {};
      if (responses.MLFLOW_TRACKING_URI === 'databricks') {
        if (responses.DATABRICKS_TOKEN) {
          apiHeaders['Authorization'] = `Bearer ${responses.DATABRICKS_TOKEN}`;
        }
      }

      const resolvedId = await resolveExperimentId(
        responses.MLFLOW_TRACKING_URI || existingEnv.MLFLOW_TRACKING_URI,
        experimentInput.value,
        apiHeaders
      );

      if (resolvedId === 'retry') {
        continue; // Ask for input again
      }

      experimentId = resolvedId;
      break;
    }

    responses.MLFLOW_EXPERIMENT_ID = experimentId;
  }

  return responses;
}

// Cleanup function to stop MLflow server
function cleanup() {
  const rootDir = path.dirname(__dirname);
  const pidFile = path.join(rootDir, '.mlflow-server.pid');
  
  if (fs.existsSync(pidFile)) {
    try {
      const pid = fs.readFileSync(pidFile, 'utf-8').trim();
      process.kill(pid, 'SIGTERM');
      fs.unlinkSync(pidFile);
      log('\n🛑 MLflow server stopped', 'yellow');
    } catch (error) {
      // Process might already be dead, just remove PID file
      try {
        fs.unlinkSync(pidFile);
      } catch {}
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('\n❌ Setup cancelled', 'red');
  process.exit(1);
});

module.exports = {
  colors,
  log,
  checkEnvFile,
  writeEnvFile,
  setupEnvironment,
  checkDatabricksConfig,
  checkMLflowServer,
  getExperimentByName,
  createExperiment,
  resolveExperimentId,
  runCommand,
  checkCommandExists,
  installMLflowLocally,
  setupMLflowConfiguration,
  cleanup
};