import dayFaucetABI from '../abi/dayFaucetABI';
import dayTokenABI from '../abi/dayTokenABI';

export const KOVAN_NETWORK_ID = 42;
export const DOCKER_NETWORK_ID = 1001;

const Networks = {
  0: {
    id: 0,
    name: 'Private',
    endpoint: 'http://localhost:8545'
  },
  1: {
    id: 1,
    name: 'Mainnet',
    endpoint: 'https://mainnet.infura.io/6M6ROam68gmdp9OeNmym',
    dayTokenAddress: '0xe814aee960a85208c3db542c53e7d4a6c8d5f60f'
  },
  3: {
    id: 3,
    name: 'Ropsten',
    endpoint: 'https://ropsten.infura.io/6M6ROam68gmdp9OeNmym',
    dayTokenAddress: '0x7941bc77E1d6BD4628467b6cD3650F20F745dB06',
    dayTokenAbi: dayTokenABI,
    dayFaucetAddress: '0xfc5c1dc438411dce1cee4971fa333ecd3c3fa7d3',
    dayFaucetAbi: dayFaucetABI
  },
  4: {
    id: 4,
    name: 'Rinkeby',
    endpoint: 'https://rinkeby.infura.io/6M6ROam68gmdp9OeNmym'
  },
  [KOVAN_NETWORK_ID]: {
    id: KOVAN_NETWORK_ID,
    name: 'Kovan',
    endpoint:
      'wss://rarely-suitable-shark.quiknode.io/87817da9-942d-4275-98c0-4176eee51e1a/aB5gwSfQdN4jmkS65F1HyA==/',
    dayTokenAddress: '0x5a6b5c6387196bd4ea264f627792af9d09096876',
    dayTokenAbi: dayTokenABI,
    dayFaucetAddress: '0x3baebd8b6839f8ae0c88fc15b9d8d7b641d06731',
    dayFaucetAbi: dayFaucetABI
  },
  [DOCKER_NETWORK_ID]: {
    id: DOCKER_NETWORK_ID,
    name: 'Docker',
    endpoint: 'http://localhost:9545',
    dayTokenAddress: process.env.DAY_TOKEN_ADDRESS_DOCKER,
    dayTokenAbi: process.env.DAY_TOKEN_ABI_DOCKER
      ? JSON.parse(process.env.DAY_TOKEN_ABI_DOCKER)
      : '[]',
    dayFaucetAddress: process.env.DAY_FAUCET_ADDRESS_DOCKER,
    dayFaucetAbi: process.env.DAY_FAUCET_ABI_DOCKER
      ? JSON.parse(process.env.DAY_FAUCET_ABI_DOCKER)
      : '[]'
  }
};

const Explorers = {
  0: '127.0.0.1:7545', // Ganache
  1: 'https://etherscan.io/',
  3: 'https://ropsten.etherscan.io/',
  4: 'https://rinkeby.etherscan.io/',
  [KOVAN_NETWORK_ID]: 'https://kovan.etherscan.io/'
};

export { Networks, Explorers };
