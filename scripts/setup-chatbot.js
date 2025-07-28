#!/usr/bin/env node
const path = require('path');
const prompts = require('prompts');
const { 
  colors, 
  log, 
  checkEnvFile, 
  setupEnvironment, 
  writeEnvFile, 
  checkDatabricksConfig,
  setupMLflowConfiguration,
  cleanup
} = require('./setup-utils');


async function main() {
  log(`${colors.bold}🚀 Chatbot App Setup${colors.reset}`, 'blue');
  log('Configure MLflow, OpenAI and Tavily for the full-stack chatbot app.\n');
  log(`Configurations entered here will be stored in the ${colors.bold}.env${colors.reset} file in the ${colors.bold}/chatbot/server${colors.reset} directory. \n`);

  const rootDir = path.dirname(__dirname);
  const envPath = path.join(rootDir, 'chatbot', 'server', '.env');

  // Check existing configuration
  const existingEnv = checkEnvFile(envPath);

  // Check different sets of required vars based on MLflow type
  const requiredVars = ['MLFLOW_TRACKING_URI', 'MLFLOW_EXPERIMENT_ID', 'OPENAI_API_KEY', 'TAVILY_API_KEY'];

  // Determine if setup is needed
  const hasDatabricksTracking = existingEnv.MLFLOW_TRACKING_URI === 'databricks';

  let needsSetup = false;
  if (hasDatabricksTracking) {
    // Check if Databricks auth is configured
    const hasDatabricksCfg = await checkDatabricksConfig();
    const hasDatabricksEnvVars = existingEnv.DATABRICKS_HOST && existingEnv.DATABRICKS_TOKEN;
    if (!hasDatabricksCfg && !hasDatabricksEnvVars) {
      needsSetup = true;
    }
    needsSetup = needsSetup || requiredVars.some(key => !existingEnv[key] || existingEnv[key].length === 0);
  } else {
    needsSetup = requiredVars.some(key => !existingEnv[key] || existingEnv[key].length === 0);
  }

  if (!needsSetup) {
    log('✅ Chatbot app is already configured!', 'green');
    log('\nTo reconfigure, delete or modify chatbot/server/.env', 'yellow');
    return;
  }

  // Configure MLflow using unified setup
  const mlflowResponses = await setupMLflowConfiguration(existingEnv, rootDir);

  // Start configuration process for remaining vars
  const configVars = [];

  // Add OpenAI and Tavily configuration
  configVars.push({
    key: 'OPENAI_API_KEY',
    message: '🤖 Enter your OpenAI API key:',
    type: 'password',
    validate: val => {
      if (!val) return 'OpenAI API key is required to run the demo app. If you don\'t have one, you can get one from https://platform.openai.com/';
      return true;
    }
  });

  configVars.push({
    key: 'TAVILY_API_KEY',
    message: '🔍 Enter your Tavily API key (for web search):',
    type: 'password',
    validate: val => val.length > 0 ? true : 'Tavily API key is required'
  });

  // Run the setup for remaining vars
  const setupResponses = await setupEnvironment('Chatbot App', envPath, configVars);

  // Merge all responses
  const finalEnv = { ...existingEnv, ...mlflowResponses, ...setupResponses };
  writeEnvFile(envPath, finalEnv);

  log(`\n${colors.bold}🎉 Chatbot app setup completed!${colors.reset}`, 'green');
  log('\n🤖 The chat app will run on http://localhost:5173', 'blue');

  if (finalEnv.MLFLOW_TRACKING_URI === 'databricks') {
    log('\n📊 You can check MLflow traces on Databricks (Experiments -> Traces)', 'blue');
    if (finalEnv.DATABRICKS_HOST) {
      log(`   Host: ${finalEnv.DATABRICKS_HOST}`, 'yellow');
    }
  } else {
    log(`\n📊 You can check MLflow traces on: ${finalEnv.MLFLOW_TRACKING_URI}/#/experiments/${finalEnv.MLFLOW_EXPERIMENT_ID}?compareRunsMode=TRACES`, 'blue');
  }
}


// Handle cleanup on exit
process.on('SIGINT', () => {
  log('\n⚠️  Setup interrupted', 'yellow');
  cleanup();
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('\n⚠️  Setup terminated', 'yellow');
  cleanup();
  process.exit(1);
});

// Run setup
main().catch(error => {
  log(`❌ Setup failed: ${error.message}`, 'red');
  cleanup();
  process.exit(1);
});