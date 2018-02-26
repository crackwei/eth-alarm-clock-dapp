import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { inject,observer } from 'mobx-react';
import Alert from '../Common/Alert';

@inject('scheduleStore')
@inject('eacService')
@inject('web3Service')
@observer
class ConfirmSettings extends Component {

  constructor(props){
    super(props);
  }

  totalCost() {
    const { scheduleStore, eacService,web3Service: { web3 } } = this.props;
    let { gasAmount, amountToSend, gasPrice, fee, timeBounty, deposit } = scheduleStore;

    amountToSend = web3.toWei(amountToSend, 'ether');
    gasPrice = web3.toWei(gasPrice, 'gwei');
    fee = web3.toWei(fee, 'ether');
    deposit = web3.toWei(deposit,'ether');

    const endowment = eacService.calcEndowment(gasAmount, amountToSend, gasPrice, fee, deposit);

    return Number(web3.fromWei(endowment, 'ether'))+Number(timeBounty); // Only for display purposes
  }

  executionWindow() {
    const { scheduleStore } = this.props;
    if (scheduleStore.isUsingTime){
      return scheduleStore.executionWindow;
    }
      return scheduleStore.blockSize;
  }

  blockOrTime(){
    const { scheduleStore } = this.props;
    if (scheduleStore.isUsingTime){
      return scheduleStore.transactionDate + ' ' + scheduleStore.transactionTime;
    }
    return scheduleStore.blockNumber ? scheduleStore.blockNumber : '-';
  }

  web3Error() {
    return !this.props.isWeb3Usable ? <Alert {...{ msg: 'You need Metamask installed and accounts Unlocked to continue' }} /> : null;
  }

  render() {
    const { scheduleStore } = this.props;
    const emptyFieldSign = '-';
    return (
      <div id="confirmSettings" className="tab-pane">
        <h2>Summary</h2>

        <div className="row">

          <div className="col-sm-6 col-md-6">
            {this.web3Error()}
            <table className="table">
              <thead>
                <tr>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>To Address</strong></td>
                  <td>{scheduleStore.toAddress ? <a href="#">{scheduleStore.toAddress}</a> : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td><strong>Amount to Send</strong></td>
                  <td>{scheduleStore.amountToSend ? scheduleStore.amountToSend + ' ETH' : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td>Data</td>
                  <td>{scheduleStore.yourData ? scheduleStore.yourData : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td>{scheduleStore.isUsingTime ? 'Time' : 'Block Number'}</td>
                  <td>{this.blockOrTime()}</td>
                </tr>
                <tr>
                  <td>Window Size</td>
                  <td>{this.executionWindow() ? this.executionWindow() : emptyFieldSign}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="col-sm-6 col-md-6">
            <table className="table">
              <thead>
                <tr className="d-none d-md-table-row">
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Gas Amount</td>
                  <td>{scheduleStore.gasAmount ? scheduleStore.gasAmount : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td>Gas Price</td>
                  <td>{scheduleStore.gasPrice ? scheduleStore.gasPrice + ' Gwei' : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td>Fee</td>
                  <td>{scheduleStore.fee ? scheduleStore.fee : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td>Time Bounty</td>
                  <td>{scheduleStore.timeBounty ? scheduleStore.timeBounty + ' ETH' : emptyFieldSign}</td>
                </tr>
                <tr>
                  <td>Deposit</td>
                  <td>{scheduleStore.deposit ? scheduleStore.deposit + ' ETH' : emptyFieldSign}</td>
                </tr>
              </tbody>
            </table>
          </div>

        </div>
        <h3 className="text-right m-t-20">Total cost: <strong>{ this.totalCost() } ETH</strong></h3>
      </div>
        );
      }
  }

ConfirmSettings.propTypes = {
  scheduleStore: PropTypes.any,
  web3Service: PropTypes.any,
  eacService: PropTypes.any,
  isWeb3Usable: PropTypes.any
};

export default ConfirmSettings;
