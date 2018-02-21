import { observable, computed } from 'mobx';

const requestFactoryStartBlocks = {
  3: 2594245,
  42: 5555500
};

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

export class TransactionStore {
  _eac = null;
  _web3 = null;
  _eacScheduler = null;

  @observable allTransactions;
  @observable filter;

  // Returns an array of transactions based on the current
  // state of the filter variable
  @computed get filteredTransactions() {
    const matchesFilter = new RegExp(this.filter, 'i');
    if (this.allTransactions) {
      return this.allTransactions.filter(
        transaction => !this.filter || matchesFilter.test(transaction.instance.address)
      );
    }
  }

  // Returns an array of only the addresses of all transactions
  @computed get allTransactionsAddresses() {
    let addresses = [];
    if (this.allTransactions) {
      addresses = this.allTransactions.map(
        transaction => transaction.instance.address
      );
    }
    return addresses;
  }

  @computed get requestFactoryStartBlock () {
    const { netId } = this._web3;
    return requestFactoryStartBlocks[netId] || 0;
  }

  constructor(eac, web3) {
    this._web3 = web3;
    this._eac = eac;

    this.setup();
  }

  async setup() {
    this._eacScheduler = await this._eac.scheduler();

    await this._web3.awaitInitialized();
  }

  async getTransactions( { startBlock, endBlock = 'latest' } ) {
    await this.setup();

    startBlock = startBlock || this.requestFactoryStartBlock;//allow all components preload

    const requestFactory = await this._eac.requestFactory();

    let requestsCreated = await requestFactory.getRequests(startBlock, endBlock);

    requestsCreated.reverse();//Switch to most recent block first

    requestsCreated = requestsCreated.map(request => this._eac.transactionRequest(request));

    return requestsCreated;
  }

  async getAllTransactions() {
    this.allTransactions = await this.getTransactions({});

    for (let transaction of this.allTransactions) {
      await transaction.fillData();
      transaction.status = await this.getTxStatus(transaction);
    }
  }

  async queryTransactions( { transactions, offset, limit, resolved } ) {
    const processed = [];

    for (let transaction of transactions) {
      await transaction.fillData();

      const isResolved = await this.isTransactionResolved(transaction);

      if (isResolved === resolved) {
        processed.push(transaction);
      }
    }

    transactions = processed;

    const total = transactions.length;

    transactions = transactions.slice(offset, offset + limit);

    return {
      transactions,
      total
    };
  }

  async getTransactionsFiltered( { startBlock, endBlock, limit = DEFAULT_LIMIT, offset = 0, resolved } ) {
    let transactions = await this.getTransactions( { startBlock, endBlock } );

    if (typeof(resolved) !== 'undefined') {
      return this.queryTransactions( {
        transactions,
        offset,
        limit,
        resolved
      } );
    }

    const total = transactions.length;

    transactions = transactions.slice(offset, offset + limit);

    return {
      transactions,
      total
    };
  }

  async getTxStatus(transaction) {
    let status = TRANSACTION_STATUS.SCHEDULED;

    if (transaction.wasCalled) {
      status = transaction.data.meta.wasSuccessful ? TRANSACTION_STATUS.EXECUTED : TRANSACTION_STATUS.FAILED;
    }

    if (transaction.isCancelled) {
      status = TRANSACTION_STATUS.CANCELLED;
    }

    if (await this.isTransactionMissed(transaction)) {
      status = TRANSACTION_STATUS.MISSED;
    }

    return status;
  }

  async getTransactionByAddress(address) {
    const txRequest = await this._eac.transactionRequest(address, this._web3);
    return txRequest;
  }

  async isTransactionResolved(transaction) {
    const isMissed = await this.isTransactionMissed(transaction);

    return isMissed || transaction.wasCalled || transaction.isCancelled;
  }

  async isTransactionMissed(transaction) {
    const executionWindowClosed = await transaction.afterExecutionWindow();

    return executionWindowClosed && !transaction.wasCalled;
  }

  async isTransactionFrozen(transaction) {
    const isFrozen = await transaction.inFreezePeriod();
    return isFrozen;
  }

  isTxUnitTimestamp(transaction) {
    return transaction.temporalUnit === TEMPORAL_UNIT.TIMESTAMP;
  }

  async cancel(transaction,txParameters) {
    return await transaction.cancel(txParameters);
  }

  async schedule(toAddress, callData = '', callGas, callValue, windowSize, windowStart, gasPrice, donation, payment, requiredDeposit, waitFormined, isTimestamp,) {
    const endowment = this._eac.calcEndowment(callGas,callValue,gasPrice,donation,payment);

    await this._eacScheduler.initSender ( {
      from: this._web3.eth.defaultAccount,
      gas: 3000000,
      value: endowment
    });

    if (isTimestamp) {
        const receipt = await this._eacScheduler.timestampSchedule (
          toAddress,
          callData,
          callGas,
          callValue,
          windowSize,
          windowStart,
          gasPrice,
          donation,
          payment,
          requiredDeposit,
          waitFormined
      );
        return receipt;
    } else {
      const receipt = await this._eacScheduler.blockSchedule (
        toAddress,
        callData,
        callGas,
        callValue,
        windowSize,
        windowStart,
        gasPrice,
        donation,
        payment,
        requiredDeposit,
        waitFormined
      );
      return receipt;
    }
  }
}
