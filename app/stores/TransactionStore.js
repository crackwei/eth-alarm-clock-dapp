import { showNotification } from '../services/notification';
import moment from 'moment';
import BigNumber from 'bignumber.js';

const requestFactoryStartBlocks = {
  1: 6204104,
  3: 2594245,
  42: 5555500
};

const BLOCK_BUCKET_SIZE = 240;
const TIMESTAMP_BUCKET_SIZE = 3600;

export const DEFAULT_LIMIT = 10;

export class TRANSACTION_STATUS {
  static SCHEDULED = 'Scheduled';
  static EXECUTED = 'Executed';
  static FAILED = 'Failed';
  static CANCELLED = 'Cancelled';
  static MISSED = 'Not executed';
}

export class TEMPORAL_UNIT {
  static BLOCK = 1;
  static TIMESTAMP = 2;
}

const PARAMS_ERROR_TO_MESSAGE_MAPPING = {
  EmptyToAddress: 'Please enter recipient address.',
  CallGasTooHigh: 'Call gas is too high.',
  ExecutionWindowTooSoon: 'Execution window too soon. Please choose later date.',
  InsufficientEndowment:
    'Automatically calculated endowment is insufficient. Please contact developers.',
  ReservedWindowBiggerThanExecutionWindow: 'Reserved window is bigger than execution window.',
  InvalidTemporalUnit: 'Temporal unit is invalid. It should be either block or time.'
};

const SCHEDULING_GAS_LIMIT = 1500000;

export class TransactionStore {
  _eac;
  _web3;
  _fetcher;
  _eacScheduler;
  _cache;
  initialized = false;

  _features;

  _requestFactory;

  _helper;

  constructor(eac, web3, fetcher, cache, featuresService, helper) {
    this._web3 = web3;
    this._eac = eac;
    this._fetcher = fetcher;
    this._cache = cache;
    this._features = featuresService;
    this._helper = helper;

    this.init();
  }

  get lastBlock() {
    return this._fetcher && this._fetcher.lastBlock;
  }

  // Returns an array of only the addresses of all transactions
  get allTransactionsAddresses() {
    return this._fetcher.allTransactionsAddresses;
  }

  get requestFactoryStartBlock() {
    const { network } = this._web3;

    return (network && requestFactoryStartBlocks[network.id]) || 0;
  }

  _initializationPromise;

  init() {
    if (!this._initializationPromise) {
      this._initializationPromise = this._init();
    }

    return this._initializationPromise;
  }

  async _init() {
    if (this.initialized) {
      return;
    }

    await this._web3.init();
    await this._features.awaitInitialized();

    if (!this._features.isCurrentNetworkSupported) {
      return;
    }

    if (!this._requestFactory) {
      this._requestFactory = await this._eac.requestFactory();
    }

    this._eacScheduler = this._eacScheduler || (await this._eac.scheduler());

    this._fetcher.requestFactoryStartBlock = this.requestFactoryStartBlock || 1;
    this._fetcher.startLazy();

    this.initialized = true;
  }

  async getTransactions({ startBlock, endBlock = 'latest' }, cached) {
    await this.init();

    startBlock = startBlock || this.requestFactoryStartBlock; // allow all components preload

    return await this._fetcher.getTransactions({ startBlock, endBlock }, cached);
  }

  async getAllTransactions(cached) {
    const transactions = await this._fetcher.getAllTransactions(cached);
    const currentTimestamp = moment().unix();

    for (const transaction of transactions) {
      transaction.status = this.getTxStatus(transaction, currentTimestamp, this.lastBlock);
    }

    return transactions;
  }

  getTxStatus(transaction, currentTimestamp) {
    return this._helper.getTxStatus(transaction, currentTimestamp, this.lastBlock);
  }

  async getAllTransactionAddresses() {
    if (
      this._fetcher.allTransactionsAddresses &&
      this._fetcher.allTransactionsAddresses.length > 0
    ) {
      return this._fetcher.allTransactionsAddresses;
    }

    return await this._fetcher.getTransactions({}, true, true);
  }

  async getBucketsForLastHours(hours) {
    const currentTimestamp = moment().unix();

    const buckets = [];

    let timestampBucket = await this.calcBucketForTimestamp(currentTimestamp);
    let blockBucket = await this.calcBucketForBlock(this.lastBlock);

    // Adding 0.5, because for each hour we fetch 2 buckets: timestamp, block.
    for (let i = 0; i < hours; i += 0.5) {
      // First, we fetch timestamp bucket, then block bucket.
      const isTimestampBucket = i % 1 === 0;

      buckets.push(isTimestampBucket ? timestampBucket : blockBucket);

      if (isTimestampBucket) {
        timestampBucket -= TIMESTAMP_BUCKET_SIZE;
      } else {
        /*
         * Since blockBucket is negative number we should add it to block bucket size,
         * if we want to go back in time.
         */
        blockBucket += BLOCK_BUCKET_SIZE;
      }
    }

    return buckets;
  }

  /**
   * @private
   * @returns Promise<{ transactions: Array }>
   */
  async _queryTransactions({
    transactions,
    offset,
    limit,
    pastHours,
    resolved,
    unresolved,
    sortByTimestampAscending
  }) {
    let processed = [];
    let total = 0;
    let buckets;

    if (pastHours) {
      buckets = await this.getBucketsForLastHours(pastHours);
    }

    const currentTimestamp = moment().unix();

    for (const transaction of transactions) {
      let isResolved = this._helper.isTransactionResolved(
        transaction,
        currentTimestamp,
        this.lastBlock
      );
      let includeTransaction = false;

      if ((isResolved && resolved) || (!isResolved && unresolved)) {
        includeTransaction = true;
      }

      if (pastHours && includeTransaction) {
        includeTransaction = buckets.includes(transaction.getBucket());
      }

      if (includeTransaction) {
        processed.push(transaction);
      }
    }

    if (unresolved) {
      const transactionsToCheck = [];
      const transactionsToExclude = [];

      for (const transaction of processed) {
        if (
          this._helper.isTransactionAfterWindowStart(transaction, currentTimestamp, this.lastBlock)
        ) {
          transactionsToCheck.push(transaction);
        }
      }

      if (transactionsToCheck.length > 0) {
        await this._fetcher.fillUpTransactions(transactions);

        for (const transaction of transactionsToCheck) {
          if (this._helper.isTransactionResolved(transaction, currentTimestamp, this.lastBlock)) {
            transactionsToExclude.push(transaction);
          }
        }

        if (transactionsToExclude.length > 0) {
          processed = processed.filter(item => !transactionsToExclude.includes(item));
        }
      }
    }

    transactions = processed;

    if (sortByTimestampAscending) {
      const currentBlockTimestamp = await this._eac.Util.getTimestampForBlock(this.lastBlock);

      transactions = transactions.sort((a, b) => {
        const aTimestamp = this._helper.getTxTimestampEstimation(
          a,
          currentBlockTimestamp,
          this.lastBlock
        );
        const bTimestamp = this._helper.getTxTimestampEstimation(
          b,
          currentBlockTimestamp,
          this.lastBlock
        );

        if (aTimestamp > bTimestamp) {
          return 1;
        }

        if (aTimestamp < bTimestamp) {
          return -1;
        }

        return 0;
      });
    }

    total = transactions.length;
    transactions = transactions.slice(offset, offset + limit);

    return {
      transactions,
      total
    };
  }

  // ------ UTILS ------
  async calcBucketForTimestamp(timestamp) {
    await this.init();

    return this._requestFactory.calcBucket(timestamp, TEMPORAL_UNIT.TIMESTAMP);
  }

  async calcBucketForBlock(blockNumber) {
    await this.init();

    return this._requestFactory.calcBucket(blockNumber, TEMPORAL_UNIT.BLOCK);
  }

  async getTransactionsFiltered({
    startBlock,
    endBlock,
    limit = DEFAULT_LIMIT,
    offset = 0,
    pastHours,
    resolved,
    unresolved,
    sortByTimestampAscending = true
  }) {
    let transactions = await this.getTransactions({ startBlock, endBlock });

    if (resolved || unresolved) {
      return await this._queryTransactions({
        transactions,
        offset,
        limit,
        pastHours,
        resolved,
        unresolved,
        sortByTimestampAscending
      });
    }

    const total = transactions.length;

    transactions = transactions.slice(offset, offset + limit);

    return {
      transactions,
      total
    };
  }

  async getRequestsByOwner(ownerAddress, { limit = DEFAULT_LIMIT, offset = 0 }) {
    if (!this._requestFactory) {
      this._requestFactory = await this._eac.requestFactory();
    }

    const transactionsAddresses = await this._requestFactory.getRequestsByOwner(ownerAddress);
    let transactions = [];

    for (let address of transactionsAddresses) {
      const tx = await this._eac.transactionRequest(address);
      await tx.fillData();
      transactions.push(tx);
    }

    return {
      transactions: transactions.slice(offset, offset + limit),
      total: transactions.length
    };
  }

  async getTransactionByAddress(address) {
    await this._web3.init();

    return await this._eac.transactionRequest(address, this._web3);
  }

  async isTransactionFrozen(transaction) {
    return await transaction.inFreezePeriod();
  }

  isTxUnitTimestamp(transaction) {
    return this._helper.isTxUnitTimestamp(transaction);
  }

  async cancel(transaction, txParameters) {
    return await transaction.cancel(txParameters);
  }

  async refund(transaction, txParameters) {
    return await transaction.sendOwnerEther(txParameters);
  }

  async getBountiesForBucket(windowStart, isUsingTime) {
    let bucket;
    if (isUsingTime) {
      bucket = await this.calcBucketForTimestamp(windowStart);
    } else {
      bucket = await this.calcBucketForBlock(windowStart);
    }
    const transactions = await this._fetcher.getTransactionsInBuckets([bucket]);

    const { web3 } = this._web3;

    const bounties = [];
    let bounty, bountyInEth;

    transactions.forEach(tx => {
      bounty = tx.data.paymentData.bounty;
      bountyInEth = new BigNumber(web3.fromWei(bounty, 'ether'));
      bounties.push(bountyInEth);
    });

    return bounties;
  }

  async validateRequestParams(
    toAddress,
    callGas,
    callValue,
    windowSize,
    windowStart,
    gasPrice,
    fee,
    timeBounty,
    requiredDeposit,
    isTimestamp,
    endowment
  ) {
    if (!this._requestFactory) {
      this._requestFactory = await this._eac.requestFactory();
    }

    const temporalUnit = isTimestamp ? 2 : 1;
    const freezePeriod = isTimestamp ? 3 * 60 : 10; // 3 minutes or 10 blocks
    const reservedWindowSize = isTimestamp ? 5 * 60 : 16; // 5 minutes or 16 blocks
    const claimWindowSize = isTimestamp ? 60 * 60 : 255; // 60 minutes or 255 blocks
    const feeRecipient = '0x0'; // stub
    const fromAddress = this._web3.eth.defaultAccount;

    const serializedParams = [
      [fromAddress, feeRecipient, toAddress],
      [
        fee,
        timeBounty,
        claimWindowSize,
        freezePeriod,
        reservedWindowSize,
        temporalUnit,
        windowSize,
        windowStart,
        callGas,
        callValue,
        gasPrice,
        requiredDeposit
      ],
      endowment
    ];

    let paramsValid = false;
    let errors = [];

    try {
      const paramsValidBooleans = await this._requestFactory.validateRequestParams(
        ...serializedParams
      );

      errors = this._requestFactory.parseIsValid(paramsValidBooleans);

      paramsValid = errors.length === 0;
    } catch (error) {
      errors.push(error);
    }

    return {
      paramsValid,
      errors
    };
  }

  async schedule(
    toAddress,
    callData = '',
    callGas,
    callValue,
    windowSize,
    windowStart,
    gasPrice,
    fee,
    payment,
    requiredDeposit,
    waitForMined,
    isTimestamp
  ) {
    const endowment = this._eac.calcEndowment(callGas, callValue, gasPrice, fee, payment);

    const { paramsValid, errors } = await this.validateRequestParams(
      toAddress,
      callGas,
      callValue,
      windowSize,
      windowStart,
      gasPrice,
      fee,
      payment,
      requiredDeposit,
      isTimestamp,
      endowment
    );

    if (!paramsValid && errors.length > 0) {
      errors.forEach(
        error => error && showNotification(PARAMS_ERROR_TO_MESSAGE_MAPPING[error], 'danger', 4000)
      );

      return;
    }

    if (typeof this._eacScheduler === 'undefined') {
      this._eacScheduler = await this._eac.scheduler();
    }

    await this._eacScheduler.initSender({
      from: this._web3.eth.defaultAccount,
      gas: SCHEDULING_GAS_LIMIT,
      value: endowment
    });

    if (isTimestamp) {
      const receipt = await this._eacScheduler.timestampSchedule(
        toAddress,
        callData,
        callGas,
        callValue,
        windowSize,
        windowStart,
        gasPrice,
        fee,
        payment,
        requiredDeposit,
        waitForMined
      );

      return receipt;
    }

    const receipt = await this._eacScheduler.blockSchedule(
      toAddress,
      callData,
      callGas,
      callValue,
      windowSize,
      windowStart,
      gasPrice,
      fee,
      payment,
      requiredDeposit,
      waitForMined
    );

    return receipt;
  }
}
