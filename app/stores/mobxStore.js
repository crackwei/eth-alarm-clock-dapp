import { observable } from 'mobx';


export default class mobxStore {
  //TimeComponent
  @observable timezone = '';
  @observable transactionDate = '';
  @observable transactionTime = '';
  @observable executionWindow = '';
  @observable customWindow = '';
  @observable donation = '';

//BlockComponent
  @observable blockNumber = '';

//BountySettings
@observable requireDeposit = true;
@observable timeBounty = '';
@observable deposit = '';

//infoSettings
@observable toAddress = '';
@observable gasAmount = '';
@observable amountToSend = '';
@observable gasPrice = '';
@observable useData = true;
@observable yourData = '';

@observable isUsingTime = true;

constructor(source) {
    Object.assign(this, source);
  }
}


//export { mobxStore };
