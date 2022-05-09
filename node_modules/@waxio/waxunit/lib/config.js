const child_process = require('child_process');
const { Api, JsonRpc } = require('eosjs');
const { JsSignatureProvider } = require('eosjs/dist/eosjs-jssig');
const fetch = require('node-fetch');
const { TextEncoder, TextDecoder } = require('util');
const { sleep } = require('./util');

/**
 * This public key is used to initialize all accounts in the local blockchain and via createAccount
 * It should be used as the active and owner keys when updating auth on accounts you create
 * @constant
 */
const TESTING_PUBLIC_KEY =
  'EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV';
const TESTING_KEY = '5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3';

const signatureProvider = new JsSignatureProvider([TESTING_KEY]);
const rpc = new JsonRpc('http://localhost:8888', { fetch });
const api = new Api({
  rpc,
  signatureProvider,
  textDecoder: new TextDecoder(),
  textEncoder: new TextEncoder(),
});

const TAPOS_BLOCKS_BEHIND = 3;

let timeAdded = 0;

/**
 * This is the standard eosjs library at the core of this library. You have access to the rpc and api members.
 * @constant
 * @type {object}
 * @example
 * eosjs.rpc.get_table_rows(...)
 * eosjs.api.transact(...)
 */
const eosjs = {
  rpc,
  api,
};

const commands = {
  getContainers: 'docker ps -a',
  stopWaxAll: 'docker stop wax-all',
  removeWaxAll: 'docker rm wax-all',
  startWaxLight:
    'docker run --entrypoint /opt/wax-all/run-light-chain.sh --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 -d -p 8080:8080 -p 8888:8888 --name wax-light 731278070712.dkr.ecr.us-east-2.amazonaws.com/wax-all:latest',
  restartWaxLight: 'docker exec -d wax-light /opt/wax-all/rerun-light-chain.sh',
  waitForChainReady:
    'docker exec wax-light /opt/wax-all/wait-a-bit-for-chain-initialized.sh',
  pullLatest:
    'docker pull 731278070712.dkr.ecr.us-east-2.amazonaws.com/wax-all:latest',
  loginAws:
    'aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 731278070712.dkr.ecr.us-east-2.amazonaws.com',
  getWaxLightIp:
    "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' wax-light",
};

function execute(command, ignoreFail = false) {
  try {
    return child_process.execSync(command, {
      encoding: 'utf8',
    });
  } catch (e) {
    if (!ignoreFail) {
      throw e;
    }
    return false;
  }
}

/**
 * Sets up the test chain docker image. Must be the first function called in your suite. Only call once
 *
 * @example
 * beforeAll(async () => {
 *   await setupTestChain():
 * });
 *
 * @api public
 */
async function setupTestChain() {
  let res = execute(commands.getContainers);
  // spaces in the targets below allow us to isolate the actual container name (some containers reuse images with these stings in them )
  const waxAllRunning = res.includes(' wax-all');
  const waxLightRunning = res.includes(' wax-light');
  if (waxAllRunning && !waxLightRunning) {
    execute(commands.stopWaxAll);
    execute(commands.removeWaxAll);
  }
  if (waxLightRunning) {
    execute(commands.restartWaxLight);
  } else {
    execute(commands.loginAws);
    execute(commands.pullLatest);
    execute(commands.startWaxLight);
  }
  while (!execute(commands.waitForChainReady, true)) {
    await sleep(1000);
  }

  // This section sorts out if we are able to access the blockchain via localhost or if we have to resort to the docker specific IP
  try {
    if (!(await getInfo())) {
      await useDockerHostForBlockchainUrl();
    }
  } catch (e) {
    await useDockerHostForBlockchainUrl();
  }

  await waitTillBlock(TAPOS_BLOCKS_BEHIND + 2);
  timeAdded = 0;
}

async function useDockerHostForBlockchainUrl() {
  const waxLightIp = execute(commands.getWaxLightIp).trim();
  const rpc = new JsonRpc(`http://${waxLightIp}:8888`, { fetch });
  const api = new Api({
    rpc,
    signatureProvider,
    textDecoder: new TextDecoder(),
    textEncoder: new TextEncoder(),
  });
  eosjs.rpc = rpc;
  eosjs.api = api;
}

function blockTimeToMs(blockTime) {
  blockTime = new Date(blockTime);
  return blockTime.getTime();
}

/**
 * Increase time of chain. This function only adds time to the current block time (never reduces). Realize that it is not super accurate.You will definitely increase time by at least the number of seconds you indicate, but likely a few seconds more. So you should not be trying to do super precision tests with this function. Give your tests a few seconds leeway when checking behaviour that does NOT exceed some time span. It will work well for exceeding timeouts, or making large leaps in time, etc.
 *
 * @param {Number} time Number of seconds to increase the chain time by
 * @param {String=} fromBlockTime Optional blocktime string. The `time` parameter will add to this absolute value as the target to increase. If this is missing, the `time` value just adds to the current blockchain time time to.
 * @return {Promise<Number>} The approximate number of milliseconds that the chain time has been increased by (not super reliable - it is usually more)
 * @api public
 */
async function addTime(time, fromBlockTime) {
  expect(time).toBeGreaterThan(0);
  const { elapsedBlocks, startingBlock } = await waitTillNextBlock(2); // This helps resolve any pending transactions
  const startTime = blockTimeToMs(startingBlock.head_block_time);
  if (fromBlockTime) {
    fromBlockTime = blockTimeToMs(fromBlockTime);
  } else {
    fromBlockTime = startTime;
  }
  time = Math.floor(
    Math.max(0, time - (startTime - fromBlockTime) / 1000 - elapsedBlocks * 0.5)
  );
  if (time === 0) {
    return 0;
  }
  let tries = 0;
  const maxTries = 10;
  do {
    if (tries >= maxTries) {
      throw new Error(
        `Exceeded ${maxTries} tries to change the blockchain time. Test cannot proceed.`
      );
    }
    execute(
      'docker exec wax-light /opt/wax-all/change-chain-time.sh +' +
        (timeAdded + time)
    );
    tries++;
  } while (!(await blockchainIsLively()));
  timeAdded += time;
  await waitTillNextBlock(2);
  const endTime = blockTimeToMs((await getInfo()).head_block_time);
  return endTime - fromBlockTime;
}

async function blockchainIsLively() {
  const startingBlockHeight = await getBlockHeight();
  await sleep(600);
  return (await getBlockHeight()) - startingBlockHeight > 0;
}

/**
 * Gets general information about the blockchain.
 * Same as https://developers.eos.io/manuals/eos/latest/nodeos/plugins/chain_api_plugin/api-reference/index#operation/get_info
 *
 * @api public
 */
async function getInfo() {
  return await eosjs.rpc.get_info();
}

/**
 * Gets the head block height
 *
 * @api public
 */
async function getBlockHeight() {
  const { head_block_num } = await getInfo();
  return head_block_num;
}

/**
 * Waits until the specified block has arrived
 *
 * @param {Number} target block height to wait for
 * @api public
 */
async function waitTillBlock(target) {
  let currentBlockHeight = await getBlockHeight();
  while (currentBlockHeight < target) {
    await sleep(300);
    currentBlockHeight = await getBlockHeight();
  }
  return currentBlockHeight;
}

async function waitTillNextBlock(numBlocks = 1) {
  const startingBlock = await getInfo();
  const currentBlockHeight = await waitTillBlock(
    startingBlock.head_block_num + numBlocks
  );
  return {
    startingBlock,
    elapsedBlocks: currentBlockHeight - startingBlock.head_block_num,
  };
}

const maxExpireSeconds = 3600;
const minExpireSeconds = 300;
const expireRandomMultiplier = maxExpireSeconds - minExpireSeconds;
/**
 * Generates the tapos fields for a transaction such that the expireSecods field is randomly generated.
 * This allows for a weak way to deduplicate repeated transactions, which can happen a lot in testing.
 *
 * @example
 * eosjs.api.transact({
 *   actions: [...],
 * },
 * dedupeTapos());
 *
 * @return {Tapos} tapos object
 * @api public
 */
function dedupeTapos() {
  return {
    blocksBehind: TAPOS_BLOCKS_BEHIND,
    // Why the random stuff? To weakly deduplicate repeated transactions
    expireSeconds:
      minExpireSeconds + Math.floor(Math.random() * expireRandomMultiplier),
  };
}

module.exports = {
  setupTestChain,
  eosjs,
  TESTING_PUBLIC_KEY,
  sleep,
  dedupeTapos,
  addTime,
  getBlockHeight,
  waitTillBlock,
  getInfo,
};
